from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.schemas import Service, ServiceCreate, ServiceUpdate
from app.services import ServiceService

router = APIRouter(prefix="/services", tags=["services"])


@router.get("/", response_model=List[Service])
async def get_services(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    service = ServiceService(db)
    return await service.get_services(skip=skip, limit=limit)


@router.get("/{service_id}", response_model=Service)
async def get_service(service_id: int, db: AsyncSession = Depends(get_db)):
    service = ServiceService(db)
    return await service.get_service(service_id)


@router.post("/", response_model=Service)
async def create_service(service: ServiceCreate, db: AsyncSession = Depends(get_db)):
    service_svc = ServiceService(db)
    return await service_svc.create_service(service)


@router.put("/{service_id}", response_model=Service)
async def update_service(
    service_id: int,
    service_update: ServiceUpdate,
    db: AsyncSession = Depends(get_db)
):
    service_svc = ServiceService(db)
    return await service_svc.update_service(service_id, service_update)


@router.delete("/{service_id}")
async def delete_service(service_id: int, db: AsyncSession = Depends(get_db)):
    service_svc = ServiceService(db)
    await service_svc.delete_service(service_id)
    return {"message": "Service deleted successfully"}