"""
ClusterContextService — fetches real-time state from a Kubernetes cluster
and builds a structured context snapshot for AI reasoning.

Supports: kind, eks, gke, openshift (all via kubeconfig or service-account auth).
"""
import asyncio
import tempfile
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import yaml
from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.cluster import Cluster


# ---------------------------------------------------------------------------
# Helper: build an ApiClient from a Cluster DB record
# ---------------------------------------------------------------------------

def _build_api_client_from_cluster(cluster: Cluster) -> Tuple[client.ApiClient, Optional[str]]:
    """
    Returns (ApiClient, tmp_cert_path_or_None).
    Caller is responsible for closing the client and deleting the cert file.
    """
    auth_method = cluster.auth_method or "kubeconfig"
    cert_path: Optional[str] = None

    if auth_method == "kubeconfig":
        if not cluster.kubeconfig_content:
            raise ValueError(f"Cluster '{cluster.name}' has no stored kubeconfig_content.")
        try:
            kubeconfig_dict = yaml.safe_load(cluster.kubeconfig_content)
        except yaml.YAMLError as exc:
            raise ValueError(f"Stored kubeconfig for '{cluster.name}' is invalid YAML.") from exc
        if not isinstance(kubeconfig_dict, dict):
            raise ValueError(f"Stored kubeconfig for '{cluster.name}' is not a valid mapping.")

        kubeconfig_dict = _normalize_kubeconfig_servers(kubeconfig_dict)
        api_client = k8s_config.kube_config.new_client_from_config_dict(kubeconfig_dict)
        return api_client, cert_path

    if auth_method == "service-account":
        creds = cluster.credentials_json or {}
        api_server_url = creds.get("api_server_url") or cluster.api_server_url
        bearer_token = creds.get("bearer_token")
        skip_tls = creds.get("skip_tls_verify", False)
        ca_cert = creds.get("ca_cert")

        if not api_server_url or not bearer_token:
            raise ValueError(
                f"Cluster '{cluster.name}' service-account creds missing api_server_url or bearer_token."
            )

        configuration = client.Configuration()
        configuration.host = api_server_url.rstrip("/")
        configuration.api_key = {"authorization": f"Bearer {bearer_token}"}
        configuration.api_key_prefix = {"authorization": "Bearer"}
        configuration.verify_ssl = not skip_tls

        if ca_cert and configuration.verify_ssl:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".crt", delete=False) as f:
                f.write(ca_cert)
                cert_path = f.name
            configuration.ssl_ca_cert = cert_path

        return client.ApiClient(configuration), cert_path

    raise ValueError(f"Unsupported auth_method '{auth_method}' for cluster '{cluster.name}'.")


# ---------------------------------------------------------------------------
# ClusterContextService
# ---------------------------------------------------------------------------

class ClusterContextService:
    """
    Builds a rich, structured context snapshot from a live cluster.
    The snapshot is passed to the AI orchestration layer.
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def build_context(
        self,
        cluster_id: int,
        db: AsyncSession,
        namespace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fetch cluster state and return a structured context dict.
        namespace=None means fetch across all namespaces.
        """
        cluster = await self._load_cluster(cluster_id, db)
        api_client, cert_path = _build_api_client_from_cluster(cluster)

        try:
            core_v1 = client.CoreV1Api(api_client)
            apps_v1 = client.AppsV1Api(api_client)

            pods, deployments, events, nodes, server_version = await asyncio.gather(
                self._fetch_pods(core_v1, namespace),
                self._fetch_deployments(apps_v1, namespace),
                self._fetch_warning_events(core_v1, namespace),
                self._fetch_nodes(core_v1),
                self._fetch_server_version(api_client),
                return_exceptions=True,
            )

            # Replace exceptions with empty lists / defaults
            pods = pods if isinstance(pods, list) else []
            deployments = deployments if isinstance(deployments, list) else []
            events = events if isinstance(events, list) else []
            nodes = nodes if isinstance(nodes, list) else []
            server_version = server_version if isinstance(server_version, str) else "unknown"

            unhealthy_pods = self._identify_unhealthy_pods(pods)
            crash_loops = self._identify_crash_loops(pods)

            context: Dict[str, Any] = {
                "cluster_id": cluster_id,
                "cluster_name": cluster.name,
                "cluster_type": cluster.cluster_type,
                "server_version": server_version,
                "namespace_filter": namespace,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "nodes": nodes,
                "pods": pods,
                "deployments": deployments,
                "warning_events": events,
                "unhealthy_pods": unhealthy_pods,
                "crash_looping_pods": crash_loops,
                "summary": self._build_summary(cluster, pods, deployments, events, nodes),
            }
            return context

        finally:
            api_client.close()
            if cert_path and os.path.exists(cert_path):
                os.unlink(cert_path)

    def build_summary_text(self, context: Dict[str, Any]) -> str:
        """Return a concise human-readable summary of the context."""
        return context.get("summary", "No cluster context available.")

    # ------------------------------------------------------------------
    # Data fetchers (sync k8s calls run in thread pool)
    # ------------------------------------------------------------------

    async def _fetch_pods(
        self, core_v1: client.CoreV1Api, namespace: Optional[str]
    ) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        try:
            if namespace:
                raw = await loop.run_in_executor(
                    None, lambda: core_v1.list_namespaced_pod(namespace=namespace)
                )
            else:
                raw = await loop.run_in_executor(None, core_v1.list_pod_for_all_namespaces)
        except ApiException as exc:
            logger.warning(f"Could not fetch pods: {exc.status} {exc.reason}")
            return []

        result = []
        for pod in raw.items:
            container_statuses = pod.status.container_statuses or []
            ready = sum(1 for c in container_statuses if c.ready)
            total = len(pod.spec.containers)
            restarts = sum(c.restart_count for c in container_statuses)

            # Determine detailed status reason
            reason = pod.status.phase or "Unknown"
            for cs in container_statuses:
                if cs.state and cs.state.waiting and cs.state.waiting.reason:
                    reason = cs.state.waiting.reason
                    break
                if cs.state and cs.state.terminated and cs.state.terminated.reason:
                    reason = cs.state.terminated.reason
                    break

            result.append(
                {
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "phase": pod.status.phase,
                    "status_reason": reason,
                    "ready": f"{ready}/{total}",
                    "restarts": restarts,
                    "node": pod.spec.node_name,
                    "age": _format_age(pod.metadata.creation_timestamp),
                }
            )
        return result

    async def _fetch_deployments(
        self, apps_v1: client.AppsV1Api, namespace: Optional[str]
    ) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        try:
            if namespace:
                raw = await loop.run_in_executor(
                    None, lambda: apps_v1.list_namespaced_deployment(namespace=namespace)
                )
            else:
                raw = await loop.run_in_executor(None, apps_v1.list_deployment_for_all_namespaces)
        except ApiException as exc:
            logger.warning(f"Could not fetch deployments: {exc.status} {exc.reason}")
            return []

        result = []
        for dep in raw.items:
            desired = dep.spec.replicas or 0
            ready = dep.status.ready_replicas or 0
            available = dep.status.available_replicas or 0
            degraded = ready < desired

            result.append(
                {
                    "name": dep.metadata.name,
                    "namespace": dep.metadata.namespace,
                    "desired": desired,
                    "ready": ready,
                    "available": available,
                    "degraded": degraded,
                    "age": _format_age(dep.metadata.creation_timestamp),
                }
            )
        return result

    async def _fetch_warning_events(
        self, core_v1: client.CoreV1Api, namespace: Optional[str], limit: int = 50
    ) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        try:
            if namespace:
                raw = await loop.run_in_executor(
                    None,
                    lambda: core_v1.list_namespaced_event(
                        namespace=namespace,
                        field_selector="type=Warning",
                        limit=limit,
                    ),
                )
            else:
                raw = await loop.run_in_executor(
                    None,
                    lambda: core_v1.list_event_for_all_namespaces(
                        field_selector="type=Warning", limit=limit
                    ),
                )
        except ApiException as exc:
            logger.warning(f"Could not fetch events: {exc.status} {exc.reason}")
            return []

        result = []
        for ev in raw.items:
            result.append(
                {
                    "namespace": ev.metadata.namespace,
                    "name": ev.metadata.name,
                    "reason": ev.reason,
                    "message": ev.message,
                    "involved_object": (
                        f"{ev.involved_object.kind}/{ev.involved_object.name}"
                        if ev.involved_object
                        else "unknown"
                    ),
                    "count": ev.count or 1,
                    "last_seen": _format_age(
                        ev.last_timestamp or ev.metadata.creation_timestamp
                    ),
                }
            )
        # Sort by count descending so the most repeated events appear first
        result.sort(key=lambda x: x["count"], reverse=True)
        return result[:limit]

    async def _fetch_nodes(self, core_v1: client.CoreV1Api) -> List[Dict[str, Any]]:
        loop = asyncio.get_event_loop()
        try:
            raw = await loop.run_in_executor(None, core_v1.list_node)
        except ApiException as exc:
            logger.warning(f"Could not fetch nodes: {exc.status} {exc.reason}")
            return []

        result = []
        for node in raw.items:
            conditions = {c.type: c.status for c in (node.status.conditions or [])}
            ready = conditions.get("Ready", "Unknown")
            result.append(
                {
                    "name": node.metadata.name,
                    "ready": ready,
                    "roles": _extract_node_roles(node),
                    "age": _format_age(node.metadata.creation_timestamp),
                    "os_image": (
                        node.status.node_info.os_image if node.status.node_info else None
                    ),
                    "kubelet_version": (
                        node.status.node_info.kubelet_version
                        if node.status.node_info
                        else None
                    ),
                }
            )
        return result

    async def _fetch_server_version(self, api_client: client.ApiClient) -> str:
        loop = asyncio.get_event_loop()
        try:
            version_api = client.VersionApi(api_client)
            info = await loop.run_in_executor(None, version_api.get_code)
            return f"{info.major}.{info.minor}"
        except Exception as exc:
            logger.warning(f"Could not fetch server version: {exc}")
            return "unknown"

    # ------------------------------------------------------------------
    # Analysis helpers
    # ------------------------------------------------------------------

    def _identify_unhealthy_pods(self, pods: List[Dict]) -> List[str]:
        unhealthy_phases = {"Failed", "Unknown", "Pending"}
        unhealthy_reasons = {
            "CrashLoopBackOff", "OOMKilled", "Error", "ImagePullBackOff",
            "ErrImagePull", "CreateContainerConfigError", "RunContainerError",
            "ContainerStatusUnknown",
        }
        return [
            f"{p['namespace']}/{p['name']}"
            for p in pods
            if p.get("phase") in unhealthy_phases
            or p.get("status_reason") in unhealthy_reasons
        ]

    def _identify_crash_loops(self, pods: List[Dict]) -> List[str]:
        return [
            f"{p['namespace']}/{p['name']}"
            for p in pods
            if p.get("status_reason") == "CrashLoopBackOff"
            or p.get("restarts", 0) >= 5
        ]

    def _build_summary(
        self,
        cluster: Cluster,
        pods: List[Dict],
        deployments: List[Dict],
        events: List[Dict],
        nodes: List[Dict],
    ) -> str:
        total_pods = len(pods)
        running_pods = sum(1 for p in pods if p.get("phase") == "Running")
        unhealthy_pods = self._identify_unhealthy_pods(pods)
        crash_loops = self._identify_crash_loops(pods)
        degraded_deps = [d for d in deployments if d.get("degraded")]
        not_ready_nodes = [n for n in nodes if n.get("ready") != "True"]

        lines = [
            f"Cluster: {cluster.name} ({cluster.cluster_type})",
            f"Nodes: {len(nodes)} total, {len(not_ready_nodes)} not-ready",
            f"Pods: {running_pods}/{total_pods} running",
        ]
        if unhealthy_pods:
            lines.append(f"Unhealthy pods: {', '.join(unhealthy_pods[:5])}")
        if crash_loops:
            lines.append(f"CrashLoopBackOff: {', '.join(crash_loops[:5])}")
        if degraded_deps:
            names = [f"{d['namespace']}/{d['name']}" for d in degraded_deps[:5]]
            lines.append(f"Degraded deployments: {', '.join(names)}")
        if events:
            lines.append(f"Top warning: {events[0]['reason']} — {events[0]['message'][:120]}")
        if not unhealthy_pods and not crash_loops and not degraded_deps:
            lines.append("Overall cluster health: nominal")
        return " | ".join(lines)

    # ------------------------------------------------------------------
    # DB helper
    # ------------------------------------------------------------------

    async def _load_cluster(self, cluster_id: int, db: AsyncSession) -> Cluster:
        result = await db.execute(select(Cluster).where(Cluster.id == cluster_id))
        cluster = result.scalar_one_or_none()
        if not cluster:
            raise ValueError(f"Cluster {cluster_id} not found.")
        if not cluster.kubeconfig_content and not cluster.credentials_json:
            raise ValueError(
                f"Cluster '{cluster.name}' has no stored credentials. "
                "Re-onboard the cluster via the wizard to persist credentials."
            )
        return cluster


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _format_age(ts) -> str:
    if not ts:
        return "unknown"
    now = datetime.now(timezone.utc)
    delta = now - ts
    if delta.days > 0:
        return f"{delta.days}d"
    h = delta.seconds // 3600
    if h > 0:
        return f"{h}h"
    m = delta.seconds // 60
    if m > 0:
        return f"{m}m"
    return f"{delta.seconds}s"


def _extract_node_roles(node) -> List[str]:
    labels = node.metadata.labels or {}
    roles = [
        k.split("/")[-1]
        for k in labels
        if k.startswith("node-role.kubernetes.io/")
    ]
    return roles or ["worker"]


def _running_in_docker() -> bool:
    return os.path.exists("/.dockerenv")


def _normalize_kubeconfig_servers(kubeconfig_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Rewrite localhost kube-api endpoints for Dockerized backend runtime."""
    if not _running_in_docker():
        return kubeconfig_dict

    clusters = kubeconfig_dict.get("clusters", [])
    for entry in clusters:
        cluster = entry.get("cluster", {})
        server = cluster.get("server")
        if isinstance(server, str):
            if "https://localhost:" in server:
                cluster["server"] = server.replace("https://localhost:", "https://host.docker.internal:")
                cluster.setdefault("tls-server-name", "localhost")
            elif "https://127.0.0.1:" in server:
                cluster["server"] = server.replace("https://127.0.0.1:", "https://host.docker.internal:")
                cluster.setdefault("tls-server-name", "localhost")
    return kubeconfig_dict
