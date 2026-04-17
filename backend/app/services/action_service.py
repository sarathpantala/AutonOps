from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from fastapi import HTTPException

from app.models import Action
from app.schemas import ActionCreate


class ActionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_actions(self, incident_id: Optional[int] = None, skip: int = 0, limit: int = 100) -> List[Action]:
        query = select(Action)
        if incident_id:
            query = query.where(Action.incident_id == incident_id)
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_action(self, action_id: int) -> Action:
        query = select(Action).where(Action.id == action_id)
        result = await self.db.execute(query)
        action = result.scalar_one_or_none()
        if not action:
            raise HTTPException(status_code=404, detail="Action not found")
        return action

    async def create_action(self, action: ActionCreate) -> Action:
        db_action = Action(**action.dict())
        self.db.add(db_action)
        await self.db.commit()
        await self.db.refresh(db_action)
        return db_action