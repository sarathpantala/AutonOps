from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from fastapi import HTTPException

from app.models import Incident
from app.schemas import IncidentCreate, IncidentUpdate


class IncidentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_incidents(self, skip: int = 0, limit: int = 100) -> List[Incident]:
        query = select(Incident).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_incident(self, incident_id: int) -> Incident:
        query = select(Incident).where(Incident.id == incident_id)
        result = await self.db.execute(query)
        incident = result.scalar_one_or_none()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        return incident

    async def create_incident(self, incident: IncidentCreate) -> Incident:
        db_incident = Incident(**incident.dict())
        self.db.add(db_incident)
        await self.db.commit()
        await self.db.refresh(db_incident)
        return db_incident

    async def update_incident(self, incident_id: int, incident_update: IncidentUpdate) -> Incident:
        incident = await self.get_incident(incident_id)
        update_data = incident_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(incident, field, value)
        await self.db.commit()
        await self.db.refresh(incident)
        return incident

    async def delete_incident(self, incident_id: int) -> None:
        incident = await self.get_incident(incident_id)
        await self.db.delete(incident)
        await self.db.commit()