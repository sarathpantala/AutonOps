from pydantic import BaseModel
from datetime import datetime


class IncidentHistoryBase(BaseModel):
    incident_id: int
    change: str


class IncidentHistoryCreate(IncidentHistoryBase):
    pass


class IncidentHistory(IncidentHistoryBase):
    id: int
    changed_at: datetime

    class Config:
        from_attributes = True