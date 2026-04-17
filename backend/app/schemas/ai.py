from pydantic import BaseModel, Field
from typing import List, Dict, Any


class IncidentAnalysisInput(BaseModel):
    metrics: Dict[str, Any] = Field(..., description="System metrics data")
    logs: List[str] = Field(..., description="Log entries")
    context: Dict[str, Any] = Field(..., description="Additional context")


class AnalysisResult(BaseModel):
    root_cause: str = Field(..., description="Identified root cause")
    remediation: str = Field(..., description="Recommended remediation steps")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")

    class Config:
        from_attributes = True