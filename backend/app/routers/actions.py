from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas import (
    Action, ActionCreate,
    ActionApproveRequest, ActionRejectRequest,
    ActionExecuteRequest, DryRunResponse, AuditLogResponse,
)
from app.services import ActionService
from app.services.action_engine_service import ActionEngineService

router = APIRouter(prefix="/actions", tags=["actions"])


# ---------------------------------------------------------------------------
# Basic CRUD (unchanged)
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[Action])
async def get_actions(
    incident_id: Optional[int] = Query(None),
    cluster_id: Optional[int] = Query(None),
    chat_session_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    service = ActionService(db)
    return await service.get_actions(
        incident_id=incident_id,
        cluster_id=cluster_id,
        chat_session_id=chat_session_id,
        status=status,
        skip=skip,
        limit=limit,
    )


@router.get("/{action_id}", response_model=Action)
async def get_action(action_id: int, db: AsyncSession = Depends(get_db)):
    service = ActionService(db)
    return await service.get_action(action_id)


@router.post("/", response_model=Action)
async def create_action(action: ActionCreate, db: AsyncSession = Depends(get_db)):
    service = ActionService(db)
    return await service.create_action(action)


# ---------------------------------------------------------------------------
# Approval workflow
# ---------------------------------------------------------------------------

@router.post("/{action_id}/approve", response_model=Action)
async def approve_action(
    action_id: int,
    request: ActionApproveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Approve an action in pending_approval state.
    After approval the action can be dry-run or executed.
    """
    engine = ActionEngineService(db)
    try:
        return await engine.approve_action(action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{action_id}/reject", response_model=Action)
async def reject_action(
    action_id: int,
    request: ActionRejectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reject an action, providing optional notes."""
    engine = ActionEngineService(db)
    try:
        return await engine.reject_action(action_id=action_id, notes=request.notes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Dry run
# ---------------------------------------------------------------------------

@router.post("/{action_id}/dry-run", response_model=DryRunResponse)
async def dry_run_action(
    action_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate the action — shows exactly what would happen without making changes.
    No cluster calls are made.
    """
    engine = ActionEngineService(db)
    try:
        return await engine.dry_run_action(action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

@router.post("/{action_id}/execute", response_model=Action)
async def execute_action(
    action_id: int,
    request: ActionExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Execute an approved action against the Kubernetes cluster.

    - action must be in 'approved' status (unless force=True)
    - 'critical' risk actions require force=True
    - creates a full audit trail
    """
    engine = ActionEngineService(db)
    try:
        return await engine.execute_action(
            action_id=action_id,
            force=request.force,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/{action_id}/audit-log", response_model=List[AuditLogResponse])
async def get_audit_log(
    action_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Complete audit trail for an action (all state transitions)."""
    engine = ActionEngineService(db)
    return await engine.get_audit_log(action_id=action_id)
