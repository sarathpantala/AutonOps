from fastapi import APIRouter, Query, HTTPException, Depends
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cluster import Cluster
from app.services import KubernetesService
from app.schemas import (
    PodInfo,
    DeploymentInfo,
    EventInfo,
    ScaleDeploymentRequest,
    K8sOperationResponse,
    ClusterOnboardingValidateRequest,
    ClusterValidationResponse,
    ClusterOnboardingConfirmResponse,
)

router = APIRouter(prefix="/k8s", tags=["kubernetes"])
k8s_service = KubernetesService()


@router.post("/onboarding/validate", response_model=ClusterValidationResponse)
async def validate_cluster_onboarding(payload: ClusterOnboardingValidateRequest):
    try:
        return await k8s_service.validate_cluster_connection(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/onboarding/confirm", response_model=ClusterOnboardingConfirmResponse)
async def confirm_cluster_onboarding(
    payload: ClusterOnboardingValidateRequest,
    workspace_id: int = Query(..., description="Workspace to associate this cluster with"),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate the cluster connection and persist credentials to the database.
    Returns the cluster_id for use in subsequent context/chat queries.
    """
    try:
        confirmed = await k8s_service.confirm_cluster_onboarding(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Persist credentials so the context builder and action engine can use them
    credentials_json = None
    if payload.auth_method == "service-account" and payload.service_account:
        sa = payload.service_account
        credentials_json = {
            "api_server_url": sa.api_server_url,
            "bearer_token": sa.bearer_token,
            "ca_cert": sa.ca_cert,
            "skip_tls_verify": sa.skip_tls_verify,
        }

    cluster = Cluster(
        name=payload.cluster_name.strip(),
        cluster_type=payload.cluster_type,
        workspace_id=workspace_id,
        status="connected",
        auth_method=payload.auth_method,
        kubeconfig_content=payload.kubeconfig_content if payload.auth_method == "kubeconfig" else None,
        credentials_json=credentials_json,
        api_server_url=(
            payload.service_account.api_server_url
            if payload.service_account and payload.auth_method == "service-account"
            else None
        ),
    )
    db.add(cluster)
    await db.commit()
    await db.refresh(cluster)

    return ClusterOnboardingConfirmResponse(
        success=confirmed.success,
        message=confirmed.message,
        cluster_name=confirmed.cluster_name,
        cluster_type=confirmed.cluster_type,
        auth_method=confirmed.auth_method,
        validated_at=confirmed.validated_at,
        cluster_id=cluster.id,
    )


@router.get("/pods", response_model=List[PodInfo])
async def get_pods(
    namespace: str = Query("default", description="Kubernetes namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector for filtering pods")
):
    if not k8s_service.core_v1:
        raise HTTPException(status_code=503, detail="Kubernetes service is not available")
    try:
        return await k8s_service.get_pods(namespace=namespace, label_selector=label_selector)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch pods: {str(e)}")


@router.get("/deployments", response_model=List[DeploymentInfo])
async def get_deployments(
    namespace: str = Query("default", description="Kubernetes namespace"),
    label_selector: Optional[str] = Query(None, description="Label selector for filtering deployments")
):
    try:
        return await k8s_service.get_deployments(namespace=namespace, label_selector=label_selector)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deployments: {str(e)}")


@router.get("/events", response_model=List[EventInfo])
async def get_events(
    namespace: str = Query("default", description="Kubernetes namespace"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of events to return")
):
    try:
        return await k8s_service.get_events(namespace=namespace, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")


@router.post("/pods/{pod_name}/restart", response_model=K8sOperationResponse)
async def restart_pod(
    pod_name: str,
    namespace: str = Query("default", description="Kubernetes namespace")
):
    result = await k8s_service.restart_pod(namespace=namespace, pod_name=pod_name)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.post("/deployments/{deployment_name}/rollout-restart", response_model=K8sOperationResponse)
async def rollout_restart_deployment(
    deployment_name: str,
    namespace: str = Query("default", description="Kubernetes namespace")
):
    result = await k8s_service.rollout_restart_deployment(namespace=namespace, deployment_name=deployment_name)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.post("/deployments/{deployment_name}/scale", response_model=K8sOperationResponse)
async def scale_deployment(
    deployment_name: str,
    scale_request: ScaleDeploymentRequest,
    namespace: str = Query("default", description="Kubernetes namespace")
):
    result = await k8s_service.scale_deployment(
        namespace=namespace,
        deployment_name=deployment_name,
        replicas=scale_request.replicas
    )
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result