from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class IncidentStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"


class IncidentBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: IncidentStatus = IncidentStatus.OPEN
    service_id: int


class IncidentCreate(IncidentBase):
    pass


class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[IncidentStatus] = None


class Incident(IncidentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True