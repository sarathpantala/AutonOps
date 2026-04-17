from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from fastapi import HTTPException

from app.models import Service
from app.schemas import ServiceCreate, ServiceUpdate


class ServiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_services(self, skip: int = 0, limit: int = 100) -> List[Service]:
        query = select(Service).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_service(self, service_id: int) -> Service:
        query = select(Service).where(Service.id == service_id)
        result = await self.db.execute(query)
        service = result.scalar_one_or_none()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        return service

    async def create_service(self, service: ServiceCreate) -> Service:
        db_service = Service(**service.dict())
        self.db.add(db_service)
        await self.db.commit()
        await self.db.refresh(db_service)
        return db_service

    async def update_service(self, service_id: int, service_update: ServiceUpdate) -> Service:
        service = await self.get_service(service_id)
        update_data = service_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(service, field, value)
        await self.db.commit()
        await self.db.refresh(service)
        return service

    async def delete_service(self, service_id: int) -> None:
        service = await self.get_service(service_id)
        await self.db.delete(service)
        await self.db.commit()