from pydantic import BaseModel
from datetime import datetime


class WorkspaceCreate(BaseModel):
    name: str
    environment_type: str = "development"
    description: str | None = None


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    environment_type: str = "development"
    description: str | None = None
    is_default: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
