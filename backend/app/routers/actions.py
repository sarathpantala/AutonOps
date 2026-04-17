from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.core.database import get_db
from app.schemas import Action, ActionCreate
from app.services import ActionService

router = APIRouter(prefix="/actions", tags=["actions"])


@router.get("/", response_model=List[Action])
async def get_actions(
    incident_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    service = ActionService(db)
    return await service.get_actions(incident_id=incident_id, skip=skip, limit=limit)


@router.get("/{action_id}", response_model=Action)
async def get_action(action_id: int, db: AsyncSession = Depends(get_db)):
    service = ActionService(db)
    return await service.get_action(action_id)


@router.post("/", response_model=Action)
async def create_action(action: ActionCreate, db: AsyncSession = Depends(get_db)):
    service = ActionService(db)
    return await service.create_action(action)