from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.schemas import Incident, IncidentCreate, IncidentUpdate
from app.services import IncidentService

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/", response_model=List[Incident])
async def get_incidents(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    service = IncidentService(db)
    return await service.get_incidents(skip=skip, limit=limit)


@router.get("/{incident_id}", response_model=Incident)
async def get_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    service = IncidentService(db)
    return await service.get_incident(incident_id)


@router.post("/", response_model=Incident)
async def create_incident(incident: IncidentCreate, db: AsyncSession = Depends(get_db)):
    service = IncidentService(db)
    return await service.create_incident(incident)


@router.put("/{incident_id}", response_model=Incident)
async def update_incident(
    incident_id: int,
    incident_update: IncidentUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = IncidentService(db)
    return await service.update_incident(incident_id, incident_update)


@router.delete("/{incident_id}")
async def delete_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    service = IncidentService(db)
    await service.delete_incident(incident_id)
    return {"message": "Incident deleted successfully"}