from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.user import User, Workspace
from app.services.auth_service import get_current_user
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces available to the current user."""
    query = select(Workspace).order_by(Workspace.created_at.asc())
    result = await db.execute(query)
    workspaces = result.scalars().all()
    return workspaces


@router.post("/", response_model=WorkspaceResponse)
async def create_workspace(
    workspace_data: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace and make it the current active workspace."""
    workspace = Workspace(
        name=workspace_data.name,
        environment_type=workspace_data.environment_type,
        description=workspace_data.description,
    )

    db.add(workspace)
    await db.flush()
    current_user.workspace_id = workspace.id

    await db.commit()
    await db.refresh(workspace)

    return workspace


@router.post("/{workspace_id}/select", response_model=WorkspaceResponse)
async def select_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    current_user.workspace_id = workspace_id
    await db.commit()
    await db.refresh(workspace)
    return workspace


@router.get("/me", response_model=WorkspaceResponse)
async def get_current_workspace(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's active workspace."""
    if not current_user.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User has no workspace assigned.",
        )

    query = select(Workspace).where(Workspace.id == current_user.workspace_id)
    result = await db.execute(query)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    return workspace

