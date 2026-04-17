from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from fastapi import HTTPException

from app.models import Action
from app.models.action import ActionType as ActionModelType
from app.models.incident import Incident
from app.schemas import ActionCreate


class ActionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_actions(
        self,
        incident_id: Optional[int] = None,
        cluster_id: Optional[int] = None,
        chat_session_id: Optional[int] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Action]:
        query = select(Action)
        if incident_id is not None:
            query = query.where(Action.incident_id == incident_id)
        if cluster_id is not None:
            query = query.where(Action.cluster_id == cluster_id)
        if chat_session_id is not None:
            query = query.where(Action.chat_session_id == chat_session_id)
        if status is not None:
            query = query.where(Action.status == status)
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
        payload = action.dict()
        action_type = action.type.value if hasattr(action.type, "value") else str(action.type)
        payload["type"] = ActionModelType[action_type.upper()]

        # Runtime-summary incidents use synthetic IDs; validate before insert to avoid FK 500s.
        incident_id = payload.get("incident_id")
        if incident_id is not None:
            incident_result = await self.db.execute(select(Incident.id).where(Incident.id == incident_id))
            if incident_result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Incident {incident_id} was not found in persistent incidents. "
                        "Use cluster_id-only action creation for runtime incidents."
                    ),
                )

        db_action = Action(**payload)
        self.db.add(db_action)
        await self.db.commit()
        await self.db.refresh(db_action)
        return db_action