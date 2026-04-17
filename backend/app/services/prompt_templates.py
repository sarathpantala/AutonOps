INCIDENT_ANALYSIS_PROMPT = """
You are an expert SRE AI assistant analyzing system incidents.

Given the following data:
- Metrics: {metrics}
- Logs: {logs}
- Context: {context}

Please analyze the incident and provide a structured JSON response with:
- root_cause: A clear description of the root cause
- remediation: Step-by-step remediation actions
- confidence: A confidence score between 0.0 and 1.0

Ensure the response is valid JSON only, no additional text.
"""

SERVICE_METRICS_PROMPT = """
Analyze the following service metrics and provide insights.

Metrics: {metrics}

Provide a structured JSON response with:
- root_cause: If any issues detected, otherwise "No issues detected"
- remediation: Recommended actions if issues found
- confidence: Confidence in the analysis (0.0-1.0)

Response must be valid JSON only.
"""