import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import os
import tempfile
import kubernetes
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import yaml
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.core.logging import logger
from app.schemas import (
    PodInfo,
    DeploymentInfo,
    EventInfo,
    K8sOperationResponse,
    ClusterOnboardingValidateRequest,
    ClusterValidationResponse,
    ClusterOnboardingConfirmResponse,
)


class KubernetesService:
    def __init__(self):
        self.core_v1 = None
        self.apps_v1 = None
        self._initialize_client()

    def _initialize_client(self):
        """Initialize Kubernetes client with kubeconfig."""
        try:
            if settings.kubeconfig_path:
                config.load_kube_config(config_file=settings.kubeconfig_path)
            else:
                config.load_kube_config()  # Use default kubeconfig location

            self.core_v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            logger.info("Kubernetes client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Kubernetes client: {e}")
            # Don't raise exception - service will be unavailable but app can still start

    def _build_api_client(self, payload: ClusterOnboardingValidateRequest):
        if payload.auth_method == "kubeconfig":
            if not payload.kubeconfig_content:
                raise ValueError("Kubeconfig content is required.")

            try:
                kubeconfig_dict = yaml.safe_load(payload.kubeconfig_content)
            except yaml.YAMLError as exc:
                raise ValueError("Kubeconfig file is invalid YAML.") from exc

            if not isinstance(kubeconfig_dict, dict):
                raise ValueError("Kubeconfig file must contain a valid Kubernetes config object.")

            return config.kube_config.new_client_from_config_dict(kubeconfig_dict), None

        if payload.auth_method == "service-account":
            if payload.service_account is None:
                raise ValueError("Service account JSON is required.")

            service_account = payload.service_account
            if not service_account.api_server_url or not service_account.bearer_token:
                raise ValueError("Service account credentials must include apiServerUrl and bearerToken.")

            configuration = client.Configuration()
            configuration.host = service_account.api_server_url.rstrip("/")
            configuration.api_key = {"authorization": f"Bearer {service_account.bearer_token}"}
            configuration.api_key_prefix = {"authorization": "Bearer"}
            configuration.verify_ssl = not service_account.skip_tls_verify

            cert_path = None
            if service_account.ca_cert and configuration.verify_ssl:
                with tempfile.NamedTemporaryFile(mode="w", suffix=".crt", delete=False) as cert_file:
                    cert_file.write(service_account.ca_cert)
                    cert_path = cert_file.name
                configuration.ssl_ca_cert = cert_path

            return client.ApiClient(configuration), cert_path

        raise ValueError("Unsupported authentication method.")

    async def validate_cluster_connection(self, payload: ClusterOnboardingValidateRequest) -> ClusterValidationResponse:
        api_client = None
        cert_path = None

        try:
            if not payload.cluster_name.strip():
                raise ValueError("Cluster name is required.")

            if payload.cluster_type not in {"eks", "gke", "openshift"}:
                raise ValueError("Unsupported cluster type.")

            api_client, cert_path = self._build_api_client(payload)
            version_api = client.VersionApi(api_client)
            core_api = client.CoreV1Api(api_client)

            version_info = await self._execute_k8s_operation(version_api.get_code)
            namespace_list = await self._execute_k8s_operation(core_api.list_namespace, limit=5)
            namespaces = [namespace.metadata.name for namespace in namespace_list.items]

            return ClusterValidationResponse(
                success=True,
                message="Cluster connection validated successfully.",
                cluster_name=payload.cluster_name.strip(),
                cluster_type=payload.cluster_type,
                auth_method=payload.auth_method,
                server_version=f"{version_info.major}.{version_info.minor}",
                namespace_count=len(namespaces),
                sample_namespaces=namespaces,
            )
        except ValueError:
            raise
        except ApiException as exc:
            logger.error(f"Cluster validation API error: {exc}")
            detail = exc.body or exc.reason or str(exc)
            raise ValueError(f"Cluster API validation failed: {detail}") from exc
        except Exception as exc:
            logger.error(f"Cluster validation failed: {exc}")
            raise ValueError(f"Unable to validate cluster connection: {str(exc)}") from exc
        finally:
            if api_client is not None:
                api_client.close()
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)

    async def confirm_cluster_onboarding(self, payload: ClusterOnboardingValidateRequest) -> ClusterOnboardingConfirmResponse:
        await self.validate_cluster_connection(payload)

        return ClusterOnboardingConfirmResponse(
            success=True,
            message="Cluster onboarding confirmed successfully.",
            cluster_name=payload.cluster_name.strip(),
            cluster_type=payload.cluster_type,
            auth_method=payload.auth_method,
            validated_at=datetime.now(timezone.utc),
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(ApiException),
    )
    async def _execute_k8s_operation(self, operation_func, *args, **kwargs):
        """Execute Kubernetes operation with retry logic."""
        try:
            # Run in thread pool since k8s client is synchronous
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, operation_func, *args, **kwargs)
        except ApiException as e:
            logger.error(f"Kubernetes API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Kubernetes operation error: {e}")
            raise

    def _format_age(self, creation_timestamp) -> str:
        """Format age from creation timestamp."""
        if not creation_timestamp:
            return "Unknown"

        now = datetime.now(timezone.utc)
        age = now - creation_timestamp

        if age.days > 0:
            return f"{age.days}d"
        elif age.seconds >= 3600:
            return f"{age.seconds // 3600}h"
        elif age.seconds >= 60:
            return f"{age.seconds // 60}m"
        else:
            return f"{age.seconds}s"

    async def get_pods(self, namespace: str = "default", label_selector: Optional[str] = None) -> List[PodInfo]:
        """Fetch pods from specified namespace."""
        try:
            pods = await self._execute_k8s_operation(
                self.core_v1.list_namespaced_pod,
                namespace=namespace,
                label_selector=label_selector
            )

            pod_list = []
            for pod in pods.items:
                # Calculate ready containers
                total_containers = len(pod.spec.containers)
                ready_containers = sum(1 for status in pod.status.container_statuses or []
                                     if status.ready)

                # Calculate restarts
                restarts = sum(status.restart_count for status in pod.status.container_statuses or [])

                pod_info = PodInfo(
                    name=pod.metadata.name,
                    namespace=pod.metadata.namespace,
                    status=pod.status.phase,
                    ready_containers=f"{ready_containers}/{total_containers}",
                    restarts=restarts,
                    age=self._format_age(pod.metadata.creation_timestamp),
                    node=pod.spec.node_name
                )
                pod_list.append(pod_info)

            return pod_list
        except Exception as e:
            logger.error(f"Failed to fetch pods: {e}")
            raise

    async def get_deployments(self, namespace: str = "default", label_selector: Optional[str] = None) -> List[DeploymentInfo]:
        """Fetch deployments from specified namespace."""
        try:
            deployments = await self._execute_k8s_operation(
                self.apps_v1.list_namespaced_deployment,
                namespace=namespace,
                label_selector=label_selector
            )

            deployment_list = []
            for deployment in deployments.items:
                deployment_info = DeploymentInfo(
                    name=deployment.metadata.name,
                    namespace=deployment.metadata.namespace,
                    replicas=f"{deployment.status.ready_replicas or 0}/{deployment.spec.replicas}",
                    available=deployment.status.available_replicas or 0,
                    ready=deployment.status.ready_replicas or 0,
                    age=self._format_age(deployment.metadata.creation_timestamp)
                )
                deployment_list.append(deployment_info)

            return deployment_list
        except Exception as e:
            logger.error(f"Failed to fetch deployments: {e}")
            raise

    async def get_events(self, namespace: str = "default", limit: int = 50) -> List[EventInfo]:
        """Fetch events from specified namespace."""
        try:
            events = await self._execute_k8s_operation(
                self.core_v1.list_namespaced_event,
                namespace=namespace,
                limit=limit
            )

            event_list = []
            for event in events.items:
                event_info = EventInfo(
                    name=event.metadata.name,
                    namespace=event.metadata.namespace,
                    type=event.type,
                    reason=event.reason,
                    message=event.message,
                    source=event.source.component if event.source else "Unknown",
                    first_seen=self._format_age(event.first_timestamp or event.metadata.creation_timestamp),
                    last_seen=self._format_age(event.last_timestamp or event.metadata.creation_timestamp),
                    count=event.count
                )
                event_list.append(event_info)

            return event_list
        except Exception as e:
            logger.error(f"Failed to fetch events: {e}")
            raise

    async def restart_pod(self, namespace: str, pod_name: str) -> K8sOperationResponse:
        """Restart a pod by deleting it (Kubernetes will recreate it)."""
        try:
            # Safety check: ensure pod exists
            pod = await self._execute_k8s_operation(
                self.core_v1.read_namespaced_pod,
                name=pod_name,
                namespace=namespace
            )

            # Check if pod is managed by a controller (deployment, statefulset, etc.)
            owner_refs = pod.metadata.owner_references or []
            if owner_refs:
                controller_name = owner_refs[0].name
                controller_kind = owner_refs[0].kind
                return K8sOperationResponse(
                    success=False,
                    message=f"Pod {pod_name} is managed by {controller_kind}/{controller_name}. Use rollout restart instead.",
                    details={"controller": f"{controller_kind}/{controller_name}"}
                )

            # Delete the pod
            await self._execute_k8s_operation(
                self.core_v1.delete_namespaced_pod,
                name=pod_name,
                namespace=namespace,
                body=client.V1DeleteOptions(grace_period_seconds=30)
            )

            logger.info(f"Pod {pod_name} in namespace {namespace} restarted successfully")
            return K8sOperationResponse(
                success=True,
                message=f"Pod {pod_name} restarted successfully",
                details={"action": "pod_restart", "pod": pod_name, "namespace": namespace}
            )
        except Exception as e:
            logger.error(f"Failed to restart pod {pod_name}: {e}")
            return K8sOperationResponse(
                success=False,
                message=f"Failed to restart pod: {str(e)}",
                details={"error": str(e)}
            )

    async def rollout_restart_deployment(self, namespace: str, deployment_name: str) -> K8sOperationResponse:
        """Perform rollout restart on a deployment."""
        try:
            # Get current deployment
            deployment = await self._execute_k8s_operation(
                self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )

            # Add or update annotation to trigger rollout
            annotations = deployment.spec.template.metadata.annotations or {}
            annotations['kubectl.kubernetes.io/restartedAt'] = datetime.now(timezone.utc).isoformat()

            # Update deployment with new annotation
            deployment.spec.template.metadata.annotations = annotations

            await self._execute_k8s_operation(
                self.apps_v1.patch_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )

            logger.info(f"Deployment {deployment_name} in namespace {namespace} rollout restarted")
            return K8sOperationResponse(
                success=True,
                message=f"Deployment {deployment_name} rollout restarted successfully",
                details={"action": "rollout_restart", "deployment": deployment_name, "namespace": namespace}
            )
        except Exception as e:
            logger.error(f"Failed to rollout restart deployment {deployment_name}: {e}")
            return K8sOperationResponse(
                success=False,
                message=f"Failed to rollout restart deployment: {str(e)}",
                details={"error": str(e)}
            )

    async def scale_deployment(self, namespace: str, deployment_name: str, replicas: int) -> K8sOperationResponse:
        """Scale a deployment to specified number of replicas."""
        try:
            # Validate replicas
            if replicas < 0:
                return K8sOperationResponse(
                    success=False,
                    message="Replicas cannot be negative",
                    details={"requested_replicas": replicas}
                )

            # Get current deployment
            deployment = await self._execute_k8s_operation(
                self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )

            # Update replicas
            deployment.spec.replicas = replicas

            await self._execute_k8s_operation(
                self.apps_v1.patch_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )

            logger.info(f"Deployment {deployment_name} in namespace {namespace} scaled to {replicas} replicas")
            return K8sOperationResponse(
                success=True,
                message=f"Deployment {deployment_name} scaled to {replicas} replicas",
                details={"action": "scale", "deployment": deployment_name, "namespace": namespace, "replicas": replicas}
            )
        except Exception as e:
            logger.error(f"Failed to scale deployment {deployment_name}: {e}")
            return K8sOperationResponse(
                success=False,
                message=f"Failed to scale deployment: {str(e)}",
                details={"error": str(e)}
            )