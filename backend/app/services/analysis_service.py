from typing import Dict, Any
from app.services.ai_service import AIService
from app.schemas import IncidentAnalysisInput, AnalysisResult


class AnalysisService:
    def __init__(self):
        self.ai_service = AIService()

    async def analyze_incident(self, incident_id: int, metrics: Dict[str, Any] = None, logs: list = None, context: Dict[str, Any] = None) -> AnalysisResult:
        """Analyze incident using AI with provided data."""
        input_data = IncidentAnalysisInput(
            metrics=metrics or {},
            logs=logs or [],
            context=context or {"incident_id": incident_id}
        )
        return await self.ai_service.analyze_incident(input_data)

    async def get_service_metrics(self, service_id: int, metrics: Dict[str, Any] = None) -> AnalysisResult:
        """Analyze service metrics using AI."""
        if metrics is None:
            # Placeholder metrics if none provided
            metrics = {
                "service_id": service_id,
                "uptime": 99.9,
                "error_rate": 0.01,
                "response_time": 150
            }
        return await self.ai_service.analyze_service_metrics(metrics)