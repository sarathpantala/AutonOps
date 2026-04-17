from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Cluster, Workspace, User
from app.schemas import ClusterCreate, ClusterResponse
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/clusters", tags=["clusters"])


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