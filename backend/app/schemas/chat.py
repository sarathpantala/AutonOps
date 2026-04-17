from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime


class IssueSchema(BaseModel):
    service: str
    problem: str
    severity: str  # low | medium | high
    reason: str


class RecommendedActionSchema(BaseModel):
    action: str
    command: str
    risk: str  # low | medium | high
    requires_approval: bool = True
    # populated after DB persistence
    action_id: Optional[int] = None
    type: Optional[str] = None
    command_payload: Optional[Dict[str, Any]] = None
    target: Optional[Dict[str, str]] = None


class SuggestedActionSchema(BaseModel):
    """Legacy alias kept for backward compat with action engine."""
    type: str = "manual"
    description: str = ""
    risk_level: str = "medium"
    requires_approval: bool = True
    dry_run_preview: str = ""
    target: Dict[str, str] = {}
    command_payload: Dict[str, Any] = {}
    action_id: Optional[int] = None


class ChatQueryRequest(BaseModel):
    cluster_id: Optional[int] = None
    workspace_id: int
    query: str
    session_id: Optional[int] = None
    namespace: Optional[str] = None
    provider: Optional[str] = None  # openai | claude


class ChatQueryResponse(BaseModel):
    session_id: int
    summary: str = ""
    issues: List[IssueSchema] = []
    recommended_actions: List[RecommendedActionSchema] = []
    confidence: float
    # legacy fields kept for backward compat
    issue: str = ""
    root_cause: str = ""
    cluster_context_summary: str = ""
    suggested_actions: List[SuggestedActionSchema] = []
    action_ids: List[int] = []


class ChatSessionResponse(BaseModel):
    id: int
    cluster_id: Optional[int]
    workspace_id: int
    title: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    meta: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True
