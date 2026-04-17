from pydantic import BaseModel
from datetime import datetime
from typing import Any, Dict, Optional
from enum import Enum


class ActionType(str, Enum):
    MANUAL = "manual"
    AUTOMATED = "automated"
    RESTART_POD = "restart_pod"
    ROLLOUT_RESTART = "rollout_restart"
    SCALE_DEPLOYMENT = "scale_deployment"
    DELETE_POD = "delete_pod"
    CORDON_NODE = "cordon_node"
    DRAIN_NODE = "drain_node"
    PATCH_DEPLOYMENT = "patch_deployment"
    EXEC_COMMAND = "exec_command"


class ActionBase(BaseModel):
    incident_id: Optional[int] = None
    cluster_id: Optional[int] = None
    type: ActionType = ActionType.MANUAL
    description: str


class ActionCreate(ActionBase):
    pass


class Action(ActionBase):
    id: int
    status: str = "pending_approval"
    risk_level: str = "low"
    cluster_id: Optional[int] = None
    chat_session_id: Optional[int] = None
    command_payload: Optional[Dict[str, Any]] = None
    is_dry_run: bool = False
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_notes: Optional[str] = None
    execution_result: Optional[str] = None
    error_message: Optional[str] = None
    executed_at: datetime

    class Config:
        from_attributes = True


class ActionApproveRequest(BaseModel):
    notes: Optional[str] = None


class ActionRejectRequest(BaseModel):
    notes: Optional[str] = None


class ActionExecuteRequest(BaseModel):
    dry_run: bool = False
    force: bool = False


class DryRunResponse(BaseModel):
    action_id: int
    operation: str
    namespace: str
    name: str
    preview: str
    risk_level: str
    would_affect: str


class AuditLogResponse(BaseModel):
    id: int
    action_id: Optional[int]
    user_id: Optional[int]
    cluster_id: Optional[int]
    event_type: str
    details: Optional[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True
