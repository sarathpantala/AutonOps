from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel

from app.services import AnalysisService
from app.schemas import IncidentAnalysisInput, AnalysisResult

router = APIRouter(prefix="/analysis", tags=["analysis"])
analysis_service = AnalysisService()


class IncidentAnalysisRequest(BaseModel):
    metrics: Optional[Dict[str, Any]] = {}
    logs: Optional[list] = []
    context: Optional[Dict[str, Any]] = {}


@router.post("/incidents/{incident_id}", response_model=AnalysisResult)
async def analyze_incident(incident_id: int, request: IncidentAnalysisRequest):
    try:
        return await analysis_service.analyze_incident(
            incident_id=incident_id,
            metrics=request.metrics,
            logs=request.logs,
            context=request.context
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/services/{service_id}/metrics", response_model=AnalysisResult)
async def get_service_metrics(service_id: int):
    try:
        return await analysis_service.get_service_metrics(service_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metrics analysis failed: {str(e)}")