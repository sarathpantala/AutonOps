from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.database import get_db
from app.models import Cluster, Workspace, User
from app.models.action import Action
from app.models.audit_log import AuditLog
from app.models.chat import ChatSession
from app.schemas import ClusterCreate, ClusterResponse
from app.services.auth_service import get_current_user
from app.services.context_service import ClusterContextService

router = APIRouter(prefix="/clusters", tags=["clusters"])


def _infer_service_name(resource_name: str) -> str:
    if not resource_name:
        return "unknown-service"
    # Convert pod/deployment names to a stable service key
    parts = resource_name.split("-")
    if len(parts) >= 3 and parts[-1].isalnum():
        return "-".join(parts[:-2]) or resource_name
    return parts[0] if len(parts) > 1 else resource_name


def _infer_service_id(resource_name: str, service_id_map: dict[str, int]) -> int:
    inferred = _infer_service_name(resource_name)
    return service_id_map.get(inferred, next(iter(service_id_map.values()), 0))


@router.get("/", response_model=list[ClusterResponse])
async def list_clusters(
    workspace_id: int = Query(..., description="Workspace identifier"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    result = await db.execute(
        select(Cluster).where(Cluster.workspace_id == workspace_id).order_by(Cluster.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ClusterResponse)
async def create_cluster(
    payload: ClusterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, payload.workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    cluster = Cluster(
        name=payload.name.strip(),
        cluster_type=payload.cluster_type,
        workspace_id=payload.workspace_id,
        status=payload.status,
    )
    db.add(cluster)
    await db.commit()
    await db.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}")
async def delete_cluster(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    cluster = await db.get(Cluster, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found.")

    # Detach foreign-key references before deleting the cluster row.
    action_result = await db.execute(select(Action).where(Action.cluster_id == cluster_id))
    for action in action_result.scalars().all():
        action.cluster_id = None

    audit_result = await db.execute(select(AuditLog).where(AuditLog.cluster_id == cluster_id))
    for audit in audit_result.scalars().all():
        audit.cluster_id = None

    session_result = await db.execute(select(ChatSession).where(ChatSession.cluster_id == cluster_id))
    for session in session_result.scalars().all():
        session.cluster_id = None

    await db.delete(cluster)
    await db.commit()
    return {"message": "Cluster deleted successfully."}


@router.get("/{cluster_id}/runtime-summary")
async def get_cluster_runtime_summary(
    cluster_id: int,
    namespace: str | None = Query(None, description="Optional namespace filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    cluster = await db.get(Cluster, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found.")

    context_service = ClusterContextService()
    try:
        context = await context_service.build_context(cluster_id=cluster_id, db=db, namespace=namespace)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to load cluster context: {exc}") from exc

    deployments = context.get("deployments", [])
    warning_events = context.get("warning_events", [])
    unhealthy_pods = context.get("unhealthy_pods", [])
    crash_looping_pods = context.get("crash_looping_pods", [])

    services: list[dict[str, Any]] = []
    service_id_map: dict[str, int] = {}
    for index, deployment in enumerate(deployments, start=1):
        service_name = deployment.get("name", f"service-{index}")
        service_id_map[service_name] = index
        services.append(
            {
                "id": index,
                "name": service_name,
                "description": f"Cluster runtime service in namespace {deployment.get('namespace', 'default')}",
                "is_active": not bool(deployment.get("degraded", False)),
                "created_at": context.get("fetched_at"),
                "updated_at": context.get("fetched_at"),
            }
        )

    incidents: list[dict[str, Any]] = []
    next_incident_id = 1

    for event in warning_events:
        involved = event.get("involved_object", "")
        resource_name = involved.split("/")[-1] if "/" in involved else involved
        incidents.append(
            {
                "id": next_incident_id,
                "title": f"{event.get('reason', 'Warning')}: {event.get('message', 'Cluster warning')}",
                "description": event.get("message", ""),
                "status": "open",
                "service_id": _infer_service_id(resource_name, service_id_map),
                "created_at": context.get("fetched_at"),
                "updated_at": None,
            }
        )
        next_incident_id += 1

    for pod_ref in unhealthy_pods + crash_looping_pods:
        resource_name = pod_ref.split("/")[-1]
        incidents.append(
            {
                "id": next_incident_id,
                "title": f"Pod health issue: {pod_ref}",
                "description": "Pod reported as unhealthy or crash-looping in live cluster context.",
                "status": "open",
                "service_id": _infer_service_id(resource_name, service_id_map),
                "created_at": context.get("fetched_at"),
                "updated_at": None,
            }
        )
        next_incident_id += 1

    return {
        "cluster_id": cluster_id,
        "cluster_name": context.get("cluster_name"),
        "summary": context.get("summary", ""),
        "services": services,
        "incidents": incidents,
    }