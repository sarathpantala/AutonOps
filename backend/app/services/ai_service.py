import json
import asyncio
from typing import Dict, Any
import openai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.core.logging import logger
from app.schemas import IncidentAnalysisInput, AnalysisResult
from .prompt_templates import INCIDENT_ANALYSIS_PROMPT, SERVICE_METRICS_PROMPT


class AIService:
    def __init__(self):
        self.client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4"  # or gpt-3.5-turbo for cost savings

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        retry=retry_if_exception_type((openai.APIError, openai.APIConnectionError, openai.RateLimitError)),
    )
    async def _call_openai(self, prompt: str, timeout: int = 30) -> str:
        """Call OpenAI API with retry logic and timeout."""
        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=1000,
                    temperature=0.1,  # Low temperature for consistent analysis
                ),
                timeout=timeout
            )
            return response.choices[0].message.content.strip()
        except asyncio.TimeoutError:
            logger.error("OpenAI API call timed out")
            raise
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise

    def _validate_json_response(self, response: str) -> Dict[str, Any]:
        """Validate and parse JSON response."""
        try:
            data = json.loads(response)
            # Validate required fields
            required_fields = ["root_cause", "remediation", "confidence"]
            for field in required_fields:
                if field not in data:
                    raise ValueError(f"Missing required field: {field}")

            # Validate confidence is float between 0 and 1
            if not isinstance(data["confidence"], (int, float)) or not (0.0 <= data["confidence"] <= 1.0):
                raise ValueError("Confidence must be a number between 0.0 and 1.0")

            return data
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response: {response}")
            raise ValueError(f"Response is not valid JSON: {e}")
        except Exception as e:
            logger.error(f"Response validation error: {e}")
            raise

    async def analyze_incident(self, input_data: IncidentAnalysisInput) -> AnalysisResult:
        """Analyze incident using AI."""
        prompt = INCIDENT_ANALYSIS_PROMPT.format(
            metrics=json.dumps(input_data.metrics, indent=2),
            logs="\n".join(input_data.logs),
            context=json.dumps(input_data.context, indent=2)
        )

        logger.info("Starting incident analysis with AI")
        raw_response = await self._call_openai(prompt)
        logger.info(f"Received AI response: {raw_response}")

        validated_data = self._validate_json_response(raw_response)

        return AnalysisResult(**validated_data)

    async def analyze_service_metrics(self, metrics: Dict[str, Any]) -> AnalysisResult:
        """Analyze service metrics using AI."""
        prompt = SERVICE_METRICS_PROMPT.format(
            metrics=json.dumps(metrics, indent=2)
        )

        logger.info("Starting service metrics analysis with AI")
        raw_response = await self._call_openai(prompt)
        logger.info(f"Received AI response: {raw_response}")

        validated_data = self._validate_json_response(raw_response)

        return AnalysisResult(**validated_data)