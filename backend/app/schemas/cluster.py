from datetime import datetime

from pydantic import BaseModel


class ClusterCreate(BaseModel):
    name: str
    cluster_type: str
    workspace_id: int
    status: str = "connected"


class ClusterResponse(BaseModel):
    id: int
    name: str
    cluster_type: str
    status: str
    workspace_id: int
    created_at: datetime

    class Config:
        from_attributes = True