"""
ActionEngineService — manages the full lifecycle of SRE actions:
  PENDING_APPROVAL → APPROVED/REJECTED → (DRY_RUN →) EXECUTING → COMPLETED/FAILED

Integrates with:
- KubernetesService for execution
- AuditLog model for complete audit trail
- Risk classification to gate dangerous operations
"""
import asyncio
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import yaml
from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.action import Action, ActionType
from app.models.audit_log import AuditLog
from app.models.cluster import Cluster


# ---------------------------------------------------------------------------
# Risk gate — operations that must be approved before execution
# ---------------------------------------------------------------------------

ALWAYS_REQUIRE_APPROVAL = {"high", "critical"}

# Map action type → max allowed risk without extra confirmation
RISK_THRESHOLDS: Dict[str, str] = {
    "restart_pod": "low",
    "rollout_restart": "medium",
    "scale_deployment": "medium",
    "delete_pod": "high",
    "cordon_node": "high",
    "drain_node": "critical",
    "patch_deployment": "medium",
    "exec_command": "high",
    "manual": "low",
}

RISK_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def _risk_exceeds(actual: str, threshold: str) -> bool:
    return RISK_ORDER.get(actual, 0) > RISK_ORDER.get(threshold, 0)


# ---------------------------------------------------------------------------
# ActionEngineService
# ---------------------------------------------------------------------------

class ActionEngineService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Creation
    # ------------------------------------------------------------------

    async def create_suggested_action(
        self,
        description: str,
        action_type: str,
        risk_level: str,
        command_payload: Dict[str, Any],
        cluster_id: Optional[int] = None,
        incident_id: Optional[int] = None,
        chat_session_id: Optional[int] = None,
    ) -> Action:
        """
        Persist an AI-suggested action in PENDING_APPROVAL status.
        """
        model_type = self._map_action_type(action_type)

        action = Action(
            description=description,
            type=model_type,
            risk_level=risk_level,
            status="pending_approval",
            command_payload=command_payload,
            cluster_id=cluster_id,
            incident_id=incident_id,
            chat_session_id=chat_session_id,
            is_dry_run=False,
        )
        self.db.add(action)
        await self.db.commit()
        await self.db.refresh(action)

        await self._write_audit(
            action_id=action.id,
            cluster_id=cluster_id,
            event_type="SUGGESTED",
            details={"type": action_type, "risk_level": risk_level, "command": command_payload},
        )
        return action

    # ------------------------------------------------------------------
    # Approval workflow
    # ------------------------------------------------------------------

    async def approve_action(
        self,
        action_id: int,
        user_id: Optional[int] = None,
    ) -> Action:
        action = await self._get_action(action_id)

        if action.status not in ("pending_approval",):
            raise ValueError(
                f"Action {action_id} cannot be approved from status '{action.status}'."
            )

        action.status = "approved"
        action.approved_by = user_id
        action.approved_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(action)

        await self._write_audit(
            action_id=action.id,
            cluster_id=action.cluster_id,
            user_id=user_id,
            event_type="APPROVED",
            details={"approved_by": user_id},
        )
        return action

    async def reject_action(
        self,
        action_id: int,
        notes: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> Action:
        action = await self._get_action(action_id)

        if action.status not in ("pending_approval", "approved"):
            raise ValueError(
                f"Action {action_id} cannot be rejected from status '{action.status}'."
            )

        action.status = "rejected"
        action.rejection_notes = notes
        await self.db.commit()
        await self.db.refresh(action)

        await self._write_audit(
            action_id=action.id,
            cluster_id=action.cluster_id,
            user_id=user_id,
            event_type="REJECTED",
            details={"notes": notes},
        )
        return action

    # ------------------------------------------------------------------
    # Dry run
    # ------------------------------------------------------------------

    async def dry_run_action(self, action_id: int) -> Dict[str, Any]:
        """
        Simulate the action without executing it.
        Returns a preview of what would happen.
        """
        action = await self._get_action(action_id)

        if action.status not in ("pending_approval", "approved"):
            raise ValueError(
                f"Action {action_id} cannot be dry-run from status '{action.status}'."
            )

        payload = action.command_payload or {}
        operation = payload.get("operation", "unknown")
        namespace = payload.get("namespace", "default")
        name = payload.get("name", "unknown")
        params = payload.get("params", {})

        preview = self._build_dry_run_preview(operation, namespace, name, params)

        await self._write_audit(
            action_id=action.id,
            cluster_id=action.cluster_id,
            event_type="DRY_RUN",
            details={"preview": preview, "payload": payload},
        )
        return {
            "action_id": action_id,
            "operation": operation,
            "namespace": namespace,
            "name": name,
            "preview": preview,
            "risk_level": action.risk_level,
            "would_affect": self._estimate_blast_radius(operation, namespace, name),
        }

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute_action(
        self,
        action_id: int,
        user_id: Optional[int] = None,
        force: bool = False,
    ) -> Action:
        """
        Execute an approved action against the Kubernetes cluster.
        Only APPROVED actions can be executed unless force=True.
        """
        action = await self._get_action(action_id)

        # Safety gate
        if not force and action.status != "approved":
            raise ValueError(
                f"Action {action_id} must be approved before execution (current: '{action.status}'). "
                "Use approve_action first, or pass force=True to bypass."
            )

        # Block critical risk without explicit user opt-in
        if action.risk_level == "critical" and not force:
            raise ValueError(
                f"Action {action_id} is classified CRITICAL risk. "
                "Set force=True to execute after careful review."
            )

        if not action.cluster_id:
            raise ValueError(f"Action {action_id} has no associated cluster.")

        action.status = "executing"
        await self.db.commit()

        await self._write_audit(
            action_id=action.id,
            cluster_id=action.cluster_id,
            user_id=user_id,
            event_type="EXECUTING",
            details={"payload": action.command_payload},
        )

        try:
            result = await self._perform_k8s_operation(action)
            action.status = "completed"
            action.execution_result = result
            action.error_message = None
        except Exception as exc:
            logger.error(f"Action {action_id} execution failed: {exc}")
            action.status = "failed"
            action.error_message = str(exc)
            await self.db.commit()
            await self._write_audit(
                action_id=action.id,
                cluster_id=action.cluster_id,
                user_id=user_id,
                event_type="FAILED",
                details={"error": str(exc)},
            )
            raise

        await self.db.commit()
        await self.db.refresh(action)

        await self._write_audit(
            action_id=action.id,
            cluster_id=action.cluster_id,
            user_id=user_id,
            event_type="COMPLETED",
            details={"result": result},
        )
        return action

    # ------------------------------------------------------------------
    # Kubernetes operation dispatcher
    # ------------------------------------------------------------------

    async def _perform_k8s_operation(self, action: Action) -> str:
        payload = action.command_payload or {}
        operation = payload.get("operation", "")
        namespace = payload.get("namespace", "default")
        name = payload.get("name", "")
        params = payload.get("params", {})

        api_client, cert_path = await self._build_k8s_client(action.cluster_id)
        core_v1 = client.CoreV1Api(api_client)
        apps_v1 = client.AppsV1Api(api_client)

        try:
            loop = asyncio.get_event_loop()

            if operation == "restart_pod":
                await loop.run_in_executor(
                    None,
                    lambda: core_v1.delete_namespaced_pod(
                        name=name,
                        namespace=namespace,
                        body=client.V1DeleteOptions(grace_period_seconds=30),
                    ),
                )
                return f"Pod '{namespace}/{name}' deleted — will be recreated by its controller."

            elif operation == "rollout_restart":
                # Patch deployment with a restart annotation
                patch = {
                    "spec": {
                        "template": {
                            "metadata": {
                                "annotations": {
                                    "kubectl.kubernetes.io/restartedAt": datetime.now(
                                        timezone.utc
                                    ).isoformat()
                                }
                            }
                        }
                    }
                }
                await loop.run_in_executor(
                    None,
                    lambda: apps_v1.patch_namespaced_deployment(
                        name=name, namespace=namespace, body=patch
                    ),
                )
                return f"Rollout restart triggered for deployment '{namespace}/{name}'."

            elif operation == "scale_deployment":
                replicas = int(params.get("replicas", 1))
                patch = {"spec": {"replicas": replicas}}
                await loop.run_in_executor(
                    None,
                    lambda: apps_v1.patch_namespaced_deployment_scale(
                        name=name, namespace=namespace, body=patch
                    ),
                )
                return f"Deployment '{namespace}/{name}' scaled to {replicas} replicas."

            elif operation == "delete_pod":
                grace = int(params.get("grace_period_seconds", 0))
                await loop.run_in_executor(
                    None,
                    lambda: core_v1.delete_namespaced_pod(
                        name=name,
                        namespace=namespace,
                        body=client.V1DeleteOptions(grace_period_seconds=grace),
                    ),
                )
                return f"Pod '{namespace}/{name}' force-deleted."

            elif operation == "cordon_node":
                patch = {"spec": {"unschedulable": True}}
                await loop.run_in_executor(
                    None, lambda: core_v1.patch_node(name=name, body=patch)
                )
                return f"Node '{name}' cordoned (marked unschedulable)."

            elif operation == "patch_deployment":
                patch_body = params.get("patch", {})
                await loop.run_in_executor(
                    None,
                    lambda: apps_v1.patch_namespaced_deployment(
                        name=name, namespace=namespace, body=patch_body
                    ),
                )
                return f"Deployment '{namespace}/{name}' patched successfully."

            else:
                raise ValueError(
                    f"Unsupported operation '{operation}'. "
                    "Supported: restart_pod, rollout_restart, scale_deployment, "
                    "delete_pod, cordon_node, patch_deployment"
                )

        except ApiException as exc:
            raise RuntimeError(
                f"Kubernetes API error ({exc.status}): {exc.body or exc.reason}"
            ) from exc
        finally:
            api_client.close()
            if cert_path and os.path.exists(cert_path):
                os.unlink(cert_path)

    # ------------------------------------------------------------------
    # K8s client builder (from stored cluster credentials)
    # ------------------------------------------------------------------

    async def _build_k8s_client(
        self, cluster_id: int
    ):
        result = await self.db.execute(select(Cluster).where(Cluster.id == cluster_id))
        cluster = result.scalar_one_or_none()
        if not cluster:
            raise ValueError(f"Cluster {cluster_id} not found.")

        # Re-use the same logic as context_service
        from app.services.context_service import _build_api_client_from_cluster
        return _build_api_client_from_cluster(cluster)

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------

    async def _write_audit(
        self,
        event_type: str,
        details: Optional[Dict[str, Any]] = None,
        action_id: Optional[int] = None,
        cluster_id: Optional[int] = None,
        user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        log = AuditLog(
            action_id=action_id,
            cluster_id=cluster_id,
            user_id=user_id,
            event_type=event_type,
            details=details,
            ip_address=ip_address,
        )
        self.db.add(log)
        await self.db.commit()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_action(self, action_id: int) -> Action:
        result = await self.db.execute(select(Action).where(Action.id == action_id))
        action = result.scalar_one_or_none()
        if not action:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail=f"Action {action_id} not found.")
        return action

    def _map_action_type(self, action_type: str) -> ActionType:
        mapping = {
            "restart_pod": ActionType.RESTART_POD,
            "rollout_restart": ActionType.ROLLOUT_RESTART,
            "scale_deployment": ActionType.SCALE_DEPLOYMENT,
            "delete_pod": ActionType.DELETE_POD,
            "cordon_node": ActionType.CORDON_NODE,
            "drain_node": ActionType.DRAIN_NODE,
            "patch_deployment": ActionType.PATCH_DEPLOYMENT,
            "exec_command": ActionType.EXEC_COMMAND,
            "manual": ActionType.MANUAL,
            "automated": ActionType.AUTOMATED,
        }
        return mapping.get(action_type.lower(), ActionType.MANUAL)

    def _build_dry_run_preview(
        self, operation: str, namespace: str, name: str, params: Dict
    ) -> str:
        previews = {
            "restart_pod": (
                f"[DRY RUN] Would delete pod '{namespace}/{name}'. "
                "If managed by a Deployment/StatefulSet, it will be automatically recreated."
            ),
            "rollout_restart": (
                f"[DRY RUN] Would annotate Deployment '{namespace}/{name}' with "
                "kubectl.kubernetes.io/restartedAt, triggering a rolling restart of all pods."
            ),
            "scale_deployment": (
                f"[DRY RUN] Would scale Deployment '{namespace}/{name}' to "
                f"{params.get('replicas', '?')} replicas."
            ),
            "delete_pod": (
                f"[DRY RUN] Would force-delete pod '{namespace}/{name}' with "
                f"grace period {params.get('grace_period_seconds', 0)}s."
            ),
            "cordon_node": (
                f"[DRY RUN] Would cordon node '{name}', preventing new pods from being scheduled."
            ),
            "patch_deployment": (
                f"[DRY RUN] Would apply patch to Deployment '{namespace}/{name}': "
                f"{params.get('patch', {})}"
            ),
        }
        return previews.get(
            operation,
            f"[DRY RUN] Would execute '{operation}' on '{namespace}/{name}'.",
        )

    def _estimate_blast_radius(
        self, operation: str, namespace: str, name: str
    ) -> str:
        blast = {
            "restart_pod": "Single pod restart; deployment will reschedule immediately.",
            "rollout_restart": "All pods in the deployment will be replaced (rolling).",
            "scale_deployment": "Replica count changes; may affect availability if scaling down.",
            "delete_pod": "Single pod terminated; may cause brief service interruption.",
            "cordon_node": "No new pods on this node; existing pods unaffected.",
            "drain_node": "All pods on the node evicted; may cause widespread disruption.",
            "patch_deployment": "Deployment spec changes; depends on patch content.",
        }
        return blast.get(operation, "Unknown blast radius.")

    async def get_audit_log(self, action_id: int) -> List[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .where(AuditLog.action_id == action_id)
            .order_by(AuditLog.created_at)
        )
        return result.scalars().all()
