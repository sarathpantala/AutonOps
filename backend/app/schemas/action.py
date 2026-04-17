from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class ActionType(str, Enum):
    MANUAL = "manual"
    AUTOMATED = "automated"


class ActionBase(BaseModel):
    incident_id: int
    type: ActionType = ActionType.MANUAL
    description: str


class ActionCreate(ActionBase):
    pass


class Action(ActionBase):
    id: int
    executed_at: datetime

    class Config:
        from_attributes = True