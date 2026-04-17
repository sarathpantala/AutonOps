"""
AIOrchestrationService — sends cluster context + user query to an LLM
and returns a structured JSON SRE analysis with actionable recommendations.

Supported providers: openai (default), claude (Anthropic)
"""
import json
import re
import asyncio
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.logging import logger


# ---------------------------------------------------------------------------
# Structured SRE prompt
# ---------------------------------------------------------------------------

SRE_SYSTEM_PROMPT = """You are AutonOps, an AI Site Reliability Engineer.

You analyze Kubernetes clusters using live data: pods, logs, metrics, and events.

Your job:
1. Detect issues and classify severity
2. Identify the root cause precisely
3. Suggest safe, kubectl-based remediation actions
4. Avoid hallucination — only use provided cluster data
5. Mark risky actions clearly

Rules:
- Be concise and accurate
- Never assume data that is not present
- Prefer targeted actions (single pod/deployment) over broad cluster changes

You MUST respond with ONLY valid JSON — no markdown, no prose, no code fences.
Every response MUST match this exact schema:

{
  "summary": "2-3 sentence overall assessment of cluster health",
  "issues": [
    {
      "service": "namespace/service-name",
      "problem": "concise problem description",
      "severity": "low|medium|high",
      "reason": "technical root cause explanation"
    }
  ],
  "recommended_actions": [
    {
      "action": "human-readable action label (e.g. Restart Pod)",
      "command": "kubectl command to execute",
      "risk": "low|medium|high",
      "requires_approval": true,
      "type": "restart_pod|rollout_restart|scale_deployment|delete_pod|patch_deployment|exec_command|manual",
      "target": {
        "namespace": "namespace-name",
        "name": "resource-name",
        "kind": "Pod|Deployment|Node"
      },
      "command_payload": {
        "operation": "restart_pod",
        "namespace": "namespace-name",
        "name": "pod-or-deployment-name",
        "params": {}
      }
    }
  ],
  "confidence": 0.0
}

Severity rules:
- high: CrashLoopBackOff, ImagePullBackOff, deployment with 0 ready replicas, OOMKilled
- medium: repeated restarts (>3), degraded deployment, persistent Warning events
- low: single restart, minor event noise, resource approaching limits

Risk rules:
- low: pod restart (controller-managed), scaling up
- medium: rollout restart, scaling down, config patch
- high: delete pod with no controller, drain node, force operations

If cluster is healthy, return issues as empty array and say so in summary.
If you are uncertain, set confidence below 0.5 and note what data is missing in summary."""


def _build_user_prompt(query: str, context: Dict[str, Any]) -> str:
    # Keep context compact to reduce token usage
    pods = context.get("pods", [])[:40]
    # Add restart_spike flag to each pod
    for p in pods:
        p["restart_spike"] = p.get("restarts", 0) > 3

    compact_context = {
        "cluster_name": context.get("cluster_name"),
        "cluster_type": context.get("cluster_type"),
        "server_version": context.get("server_version"),
        "fetched_at": context.get("fetched_at"),
        "nodes": context.get("nodes", []),
        "pods": pods,
        "deployments": context.get("deployments", [])[:20],
        "warning_events": context.get("warning_events", [])[:25],
        "unhealthy_pods": context.get("unhealthy_pods", []),
        "crash_looping_pods": context.get("crash_looping_pods", []),
        "high_restart_pods": [
            f"{p['namespace']}/{p['name']}" for p in pods if p.get("restarts", 0) > 3
        ],
    }

    return (
        f"LIVE CLUSTER STATE:\n{json.dumps(compact_context, indent=2)}\n\n"
        f"USER QUERY: {query}\n\n"
        "Analyze this cluster state, answer the query, and return ONLY the JSON response matching the schema."
    )


# ---------------------------------------------------------------------------
# AIOrchestrationService
# ---------------------------------------------------------------------------

class AIOrchestrationService:
    """
    Provider-agnostic AI layer. Supports OpenAI and Anthropic Claude.
    Falls back gracefully if a provider is unconfigured.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def sre_chat(
        self,
        query: str,
        context: Dict[str, Any],
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point.
        Returns a validated dict matching the SRE structured response schema.
        """
        effective_provider = provider or settings.ai_provider or "openai"
        user_prompt = _build_user_prompt(query, context)

        logger.info(f"SRE chat query via provider={effective_provider}: {query[:80]}")
        try:
            raw_response = await self._call_provider(effective_provider, user_prompt)
            parsed = self._parse_and_validate(raw_response, context)
            return parsed
        except Exception as exc:
            # Keep chat operational in local/dev environments when API keys are missing,
            # invalid, or provider requests fail.
            logger.warning(f"AI provider unavailable ({effective_provider}): {exc}. Falling back to local analysis.")
            return self._build_local_fallback_response(query=query, context=context)

    # ------------------------------------------------------------------
    # Provider dispatch
    # ------------------------------------------------------------------

    async def _call_provider(self, provider: str, user_prompt: str) -> str:
        if provider == "claude":
            return await self._call_claude(user_prompt)
        return await self._call_openai(user_prompt)

    async def _call_openai(self, user_prompt: str, timeout: int = 60) -> str:
        try:
            import openai
        except ImportError:
            raise RuntimeError("openai package is not installed.")

        api_key = settings.openai_api_key
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        openai_client = openai.AsyncOpenAI(api_key=api_key)
        try:
            response = await asyncio.wait_for(
                openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": SRE_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=2048,
                    response_format={"type": "json_object"},
                ),
                timeout=timeout,
            )
            return response.choices[0].message.content.strip()
        except asyncio.TimeoutError:
            logger.error("OpenAI request timed out")
            raise RuntimeError("AI provider timed out. Please retry.")
        except Exception as exc:
            logger.error(f"OpenAI error: {exc}")
            raise RuntimeError(f"OpenAI error: {exc}") from exc

    async def _call_claude(self, user_prompt: str, timeout: int = 60) -> str:
        try:
            import anthropic
        except ImportError:
            raise RuntimeError("anthropic package is not installed. Run: pip install anthropic")

        api_key = settings.anthropic_api_key
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

        claude_client = anthropic.AsyncAnthropic(api_key=api_key)
        try:
            response = await asyncio.wait_for(
                claude_client.messages.create(
                    model="claude-opus-4-5",
                    max_tokens=2048,
                    system=SRE_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": user_prompt}],
                    temperature=0.1,
                ),
                timeout=timeout,
            )
            return response.content[0].text.strip()
        except asyncio.TimeoutError:
            logger.error("Claude request timed out")
            raise RuntimeError("AI provider timed out. Please retry.")
        except Exception as exc:
            logger.error(f"Claude error: {exc}")
            raise RuntimeError(f"Claude error: {exc}") from exc

    # ------------------------------------------------------------------
    # Response validation
    # ------------------------------------------------------------------

    def _parse_and_validate(
        self, raw: str, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract JSON from the raw LLM response, validate required fields,
        apply sensible defaults. Supports both new schema (summary/issues/recommended_actions)
        and old schema (issue/root_cause/suggested_actions).
        """
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE).strip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error(f"LLM returned non-JSON: {raw[:300]}")
            raise ValueError(f"LLM did not return valid JSON: {exc}") from exc

        # ---- New schema fields ----
        data.setdefault("summary", data.get("issue", "Analysis complete."))
        data.setdefault("issues", [])
        data.setdefault("recommended_actions", [])
        data.setdefault("confidence", 0.5)

        # ---- Legacy compat fields ----
        data.setdefault("issue", data.get("summary", ""))
        data.setdefault("root_cause", "")
        data.setdefault("cluster_context_summary", context.get("summary", ""))
        data.setdefault("suggested_actions", [])

        try:
            data["confidence"] = max(0.0, min(1.0, float(data["confidence"])))
        except (TypeError, ValueError):
            data["confidence"] = 0.5

        # Validate issues
        valid_severity = {"low", "medium", "high"}
        sanitised_issues = []
        for issue in data.get("issues", []):
            if not isinstance(issue, dict):
                continue
            issue.setdefault("service", "unknown")
            issue.setdefault("problem", "Unknown problem")
            issue.setdefault("severity", "medium")
            issue.setdefault("reason", "")
            if issue["severity"] not in valid_severity:
                issue["severity"] = "medium"
            sanitised_issues.append(issue)
        data["issues"] = sanitised_issues

        # Validate recommended_actions
        valid_risk = {"low", "medium", "high"}
        sanitised_actions = []
        for action in data.get("recommended_actions", []):
            if not isinstance(action, dict):
                continue
            action.setdefault("action", "Manual action")
            action.setdefault("command", "")
            action.setdefault("risk", "medium")
            action.setdefault("requires_approval", True)
            action.setdefault("type", "manual")
            action.setdefault("target", {})
            action.setdefault("command_payload", {})
            if action["risk"] not in valid_risk:
                action["risk"] = "medium"
            if action["risk"] in ("high",):
                action["requires_approval"] = True
            sanitised_actions.append(action)
        data["recommended_actions"] = sanitised_actions

        # Also keep suggested_actions populated for action engine compat
        if not data["suggested_actions"] and sanitised_actions:
            data["suggested_actions"] = [
                {
                    "type": a.get("type", "manual"),
                    "description": a.get("action", ""),
                    "risk_level": a.get("risk", "medium"),
                    "requires_approval": a.get("requires_approval", True),
                    "dry_run_preview": a.get("command", ""),
                    "target": a.get("target", {}),
                    "command_payload": a.get("command_payload", {}),
                }
                for a in sanitised_actions
            ]

        return data

    def _build_local_fallback_response(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic fallback used when external AI providers are unavailable.
        The fallback is query-intent aware so prompts like "show unhealthy services"
        and "scale recommendations" return different summaries/actions.
        """
        unhealthy = context.get("unhealthy_pods", []) or []
        crash_loops = context.get("crash_looping_pods", []) or []
        warnings = context.get("warning_events", []) or []
        cluster_summary = context.get("summary", "Local analysis completed.")
        pods = context.get("pods", []) or []
        deployments = context.get("deployments", []) or []
        degraded_deployments = [d for d in deployments if d.get("degraded")]

        query_lower = (query or "").lower()
        wants_unhealthy = bool(
            re.search(r"\b(unhealthy|failing|degraded|not\s+ready|which\s+services|show\s+services)\b", query_lower)
        )
        wants_restart_reason = bool(
            re.search(r"\b(why\s+.*restart|pods?\s+restarting|restart(ing)?\s+pods?|why\s+.*crash(loop)?|crashloop\w*)\b", query_lower)
        )
        wants_cost_optimization = bool(
            re.search(r"\b(cost|optimi[sz]e|rightsizing|right[-\s]?size|reduce\s+spend|save\s+money|efficiency)\b", query_lower)
        )
        wants_scale = bool(
            re.search(r"\b(scale|scaling|replica|capacity|hpa|autoscal|recommend.*scale)\b", query_lower)
        )

        issues: list[Dict[str, Any]] = []
        recommended_actions: list[Dict[str, Any]] = []
        suggested_actions: list[Dict[str, Any]] = []
        confidence = 0.55

        def _add_action(action: Dict[str, Any]) -> None:
            recommended_actions.append(action)
            suggested_actions.append(
                {
                    "type": action.get("type", "manual"),
                    "description": action.get("action", "Manual action"),
                    "risk_level": action.get("risk", "medium"),
                    "requires_approval": action.get("requires_approval", True),
                    "dry_run_preview": action.get("command", ""),
                    "target": action.get("target", {}),
                    "command_payload": action.get("command_payload", {}),
                }
            )

        # Base issue detection used by all intents.
        for pod_ref in crash_loops[:3]:
            issues.append(
                {
                    "service": pod_ref,
                    "problem": "Container is in CrashLoopBackOff state",
                    "severity": "high",
                    "reason": "Repeated container restarts suggest startup failure, bad config, or dependency unavailability.",
                }
            )
            confidence = max(confidence, 0.78)

        for pod_ref in unhealthy[:3]:
            if pod_ref in crash_loops:
                continue
            issues.append(
                {
                    "service": pod_ref,
                    "problem": "Pod is not ready",
                    "severity": "medium",
                    "reason": "Readiness/health checks are failing; service may be degraded.",
                }
            )
            confidence = max(confidence, 0.65)

        for dep in degraded_deployments:
            ns = dep.get("namespace", "default")
            name = dep.get("name", "unknown")
            ready = dep.get("ready", 0)
            desired = dep.get("desired", 0)
            issues.append(
                {
                    "service": f"{ns}/{name}",
                    "problem": f"Deployment degraded: {ready}/{desired} replicas ready",
                    "severity": "high" if ready == 0 else "medium",
                    "reason": "Deployment has fewer ready replicas than desired. Pods may be failing to start.",
                }
            )

        for ev in warnings[:2]:
            involved = ev.get("involved_object", "unknown")
            if not any(i["service"] == involved for i in issues):
                issues.append(
                    {
                        "service": involved,
                        "problem": ev.get("reason", "Warning event"),
                        "severity": "low",
                        "reason": ev.get("message", "Warning event observed in cluster event stream."),
                    }
                )

        for pod in pods:
            restarts = pod.get("restarts", 0)
            pod_ref = f"{pod.get('namespace', 'default')}/{pod.get('name', 'unknown')}"
            if restarts > 5 and pod_ref not in crash_loops and pod_ref not in unhealthy:
                issues.append(
                    {
                        "service": pod_ref,
                        "problem": f"Pod has restarted {restarts} times",
                        "severity": "medium",
                        "reason": "High restart count may indicate a recurring crash or resource exhaustion.",
                    }
                )

        # Query-intent specific recommendations and summary.
        if wants_cost_optimization:
            high_restart = sorted(
                [p for p in pods if int(p.get("restarts", 0) or 0) >= 3],
                key=lambda p: int(p.get("restarts", 0) or 0),
                reverse=True,
            )

            # Cost-focused issues
            for dep in degraded_deployments[:3]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                desired = int(dep.get("desired", 0) or 0)
                ready = int(dep.get("ready", 0) or 0)
                issues.append(
                    {
                        "service": f"{ns}/{name}",
                        "problem": "Potential waste from unstable replicas",
                        "severity": "medium",
                        "reason": f"Deployment is degraded ({ready}/{desired} ready), which can waste resources through repeated retries and restarts.",
                    }
                )

            for pod in high_restart[:3]:
                ns = pod.get("namespace", "default")
                name = pod.get("name", "unknown")
                restarts = int(pod.get("restarts", 0) or 0)
                issues.append(
                    {
                        "service": f"{ns}/{name}",
                        "problem": "Restart churn increases compute cost",
                        "severity": "medium",
                        "reason": f"Pod restarted {restarts} times; repeated restarts consume CPU and scheduling cycles without useful work.",
                    }
                )

            # Cost-focused recommended actions.
            for dep in degraded_deployments[:2]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                _add_action(
                    {
                        "action": f"Stabilize {name} before scaling",
                        "command": f"kubectl rollout restart deployment/{name} -n {ns}",
                        "risk": "medium",
                        "requires_approval": True,
                        "type": "rollout_restart",
                        "target": {"namespace": ns, "name": name, "kind": "Deployment"},
                        "command_payload": {
                            "operation": "rollout_restart",
                            "namespace": ns,
                            "name": name,
                            "params": {},
                        },
                    }
                )

            for dep in deployments[:2]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                desired = int(dep.get("desired", 1) or 1)
                if desired > 1 and not dep.get("degraded"):
                    target_replicas = max(1, desired - 1)
                    _add_action(
                        {
                            "action": f"Evaluate downscale for {name} to {target_replicas}",
                            "command": f"kubectl scale deployment/{name} -n {ns} --replicas={target_replicas}",
                            "risk": "medium",
                            "requires_approval": True,
                            "type": "scale_deployment",
                            "target": {"namespace": ns, "name": name, "kind": "Deployment"},
                            "command_payload": {
                                "operation": "scale_deployment",
                                "namespace": ns,
                                "name": name,
                                "params": {"replicas": target_replicas},
                            },
                        }
                    )

            summary = (
                "Cost optimization analysis: prioritize eliminating restart churn and stabilizing degraded workloads before any broad scaling changes. "
                f"Observed {len(crash_loops)} crash-looping pod(s), {len(high_restart)} high-restart pod(s), and {len(degraded_deployments)} degraded deployment(s)."
            )
            confidence = max(confidence, 0.7)

        elif wants_scale:
            for dep in degraded_deployments[:3]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                desired = int(dep.get("desired", 1) or 1)
                recommended = max(desired + 1, 2)
                _add_action(
                    {
                        "action": f"Scale Deployment {name} to {recommended}",
                        "command": f"kubectl scale deployment/{name} -n {ns} --replicas={recommended}",
                        "risk": "medium",
                        "requires_approval": True,
                        "type": "scale_deployment",
                        "target": {"namespace": ns, "name": name, "kind": "Deployment"},
                        "command_payload": {
                            "operation": "scale_deployment",
                            "namespace": ns,
                            "name": name,
                            "params": {"replicas": recommended},
                        },
                    }
                )

            summary = (
                "Scale recommendations based on current deployment health: "
                f"{len(degraded_deployments)} degraded deployment(s), {len(unhealthy)} unhealthy pod(s). "
                "Prioritize scaling only for services with sustained traffic and failing readiness checks."
            )
            confidence = max(confidence, 0.72)

        elif wants_restart_reason:
            top_warning = warnings[0] if warnings else {}
            top_warning_reason = top_warning.get("reason", "Unknown")
            top_warning_message = top_warning.get("message", "No warning event details available.")

            restart_heavy = sorted(
                [p for p in pods if int(p.get("restarts", 0) or 0) > 0],
                key=lambda p: int(p.get("restarts", 0) or 0),
                reverse=True,
            )[:3]

            for pod in restart_heavy:
                ns = pod.get("namespace", "default")
                name = pod.get("name", "unknown")
                status_reason = pod.get("status_reason") or pod.get("phase") or "Unknown"
                restarts = int(pod.get("restarts", 0) or 0)
                if not any(i.get("service") == f"{ns}/{name}" for i in issues):
                    issues.append(
                        {
                            "service": f"{ns}/{name}",
                            "problem": f"Pod restarted {restarts} times ({status_reason})",
                            "severity": "high" if status_reason in ("CrashLoopBackOff", "OOMKilled") else "medium",
                            "reason": f"Pod state indicates {status_reason}; repeated restarts typically come from startup failure, probe failures, resource pressure, or missing dependencies.",
                        }
                    )

            for pod_ref in crash_loops[:2]:
                ns, name = pod_ref.split("/", 1) if "/" in pod_ref else ("default", pod_ref)
                _add_action(
                    {
                        "action": f"Inspect Previous Logs for {name}",
                        "command": f"kubectl logs {name} -n {ns} --previous --tail=100",
                        "risk": "low",
                        "requires_approval": False,
                        "type": "exec_command",
                        "target": {"namespace": ns, "name": name, "kind": "Pod"},
                        "command_payload": {
                            "operation": "exec_command",
                            "namespace": ns,
                            "name": name,
                            "params": {"command": ["logs", name, "--previous", "--tail=100"]},
                        },
                    }
                )
                _add_action(
                    {
                        "action": f"Describe Pod {name}",
                        "command": f"kubectl describe pod {name} -n {ns}",
                        "risk": "low",
                        "requires_approval": False,
                        "type": "exec_command",
                        "target": {"namespace": ns, "name": name, "kind": "Pod"},
                        "command_payload": {
                            "operation": "exec_command",
                            "namespace": ns,
                            "name": name,
                            "params": {"command": ["describe", "pod", name]},
                        },
                    }
                )

            summary = (
                f"Pods are restarting primarily due to {len(crash_loops)} CrashLoopBackOff workload(s). "
                f"Top warning reason: {top_warning_reason}. "
                f"Likely causes are startup/config errors, failed health probes, or dependency/database connectivity issues."
            )
            if top_warning_message:
                summary += f" Latest warning: {top_warning_message[:180]}"
            confidence = max(confidence, 0.79)

        elif wants_unhealthy:
            unhealthy_services = [i for i in issues if i.get("severity") in ("high", "medium")]
            for pod_ref in crash_loops[:2]:
                ns, name = pod_ref.split("/", 1) if "/" in pod_ref else ("default", pod_ref)
                _add_action(
                    {
                        "action": f"Restart Pod {name}",
                        "command": f"kubectl delete pod {name} -n {ns}",
                        "risk": "low",
                        "requires_approval": True,
                        "type": "restart_pod",
                        "target": {"namespace": ns, "name": name, "kind": "Pod"},
                        "command_payload": {"operation": "restart_pod", "namespace": ns, "name": name, "params": {}},
                    }
                )
            for dep in degraded_deployments[:1]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                _add_action(
                    {
                        "action": f"Rollout Restart {name}",
                        "command": f"kubectl rollout restart deployment/{name} -n {ns}",
                        "risk": "medium",
                        "requires_approval": True,
                        "type": "rollout_restart",
                        "target": {"namespace": ns, "name": name, "kind": "Deployment"},
                        "command_payload": {"operation": "rollout_restart", "namespace": ns, "name": name, "params": {}},
                    }
                )

            summary = (
                "Unhealthy services overview: "
                f"{len(unhealthy_services)} impacted service(s) found, including "
                f"{len(crash_loops)} crash-looping pod(s) and {len(degraded_deployments)} degraded deployment(s)."
            )
            confidence = max(confidence, 0.75)

        else:
            # General incident summary mode.
            for pod_ref in crash_loops[:3]:
                ns, name = pod_ref.split("/", 1) if "/" in pod_ref else ("default", pod_ref)
                _add_action(
                    {
                        "action": f"Restart Pod {name}",
                        "command": f"kubectl delete pod {name} -n {ns}",
                        "risk": "low",
                        "requires_approval": True,
                        "type": "restart_pod",
                        "target": {"namespace": ns, "name": name, "kind": "Pod"},
                        "command_payload": {"operation": "restart_pod", "namespace": ns, "name": name, "params": {}},
                    }
                )

            for dep in degraded_deployments[:2]:
                ns = dep.get("namespace", "default")
                name = dep.get("name", "unknown")
                _add_action(
                    {
                        "action": f"Rollout Restart {name}",
                        "command": f"kubectl rollout restart deployment/{name} -n {ns}",
                        "risk": "medium",
                        "requires_approval": True,
                        "type": "rollout_restart",
                        "target": {"namespace": ns, "name": name, "kind": "Deployment"},
                        "command_payload": {"operation": "rollout_restart", "namespace": ns, "name": name, "params": {}},
                    }
                )

            summary_parts = []
            if crash_loops:
                summary_parts.append(f"{len(crash_loops)} pod(s) in CrashLoopBackOff")
            if unhealthy:
                summary_parts.append(f"{len(unhealthy)} unhealthy pod(s)")
            if degraded_deployments:
                summary_parts.append(f"{len(degraded_deployments)} degraded deployment(s)")

            if not summary_parts:
                summary = "Cluster appears healthy based on available data. No critical issues detected."
                confidence = 0.55
            else:
                summary = f"Detected: {', '.join(summary_parts)}. Immediate attention recommended."

        return {
            "summary": summary,
            "issues": issues,
            "recommended_actions": recommended_actions,
            "confidence": confidence,
            # legacy compat
            "issue": issues[0]["problem"] if issues else "No critical issues detected.",
            "root_cause": issues[0]["reason"] if issues else "Cluster appears stable.",
            "cluster_context_summary": cluster_summary,
            "suggested_actions": suggested_actions,
        }
