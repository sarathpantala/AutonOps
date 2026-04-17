# AutonOps Backend

A production-grade FastAPI backend for an AI SRE platform.

## Features

- **Modular Architecture**: Organized into routers, services, models, schemas, and core modules
- **Async Support**: Built with async/await for high performance
- **Dependency Injection**: Clean separation of concerns with service layer
- **PostgreSQL Database**: SQLAlchemy ORM with async support
- **Pydantic Validation**: Request/response validation with Pydantic v2
- **Environment Configuration**: Settings management with pydantic-settings
- **Logging**: Structured logging with configurable levels
- **AI-Powered Analysis**: OpenAI integration for incident analysis and remediation
- **Retry Logic**: Robust error handling with exponential backoff
- **Timeout Handling**: Configurable timeouts for AI API calls
- **Response Validation**: Structured JSON responses with confidence scores
- **Kubernetes Integration**: Full K8s cluster management with official client
- **Safe Operations**: Built-in checks for controller-managed resources
- **Multi-Platform Support**: Works with EKS, GKE, AKS, and OpenShift
- **CORS Support**: Configurable CORS middleware

## API Endpoints

### Incidents
- `GET /incidents/` - List incidents
- `GET /incidents/{id}` - Get incident by ID
- `POST /incidents/` - Create incident
- `PUT /incidents/{id}` - Update incident
- `DELETE /incidents/{id}` - Delete incident

### Services
- `GET /services/` - List services
- `GET /services/{id}` - Get service by ID
- `POST /services/` - Create service
- `PUT /services/{id}` - Update service
- `DELETE /services/{id}` - Delete service

### Actions
- `GET /actions/` - List actions (optional incident_id filter)
- `GET /actions/{id}` - Get action by ID
- `POST /actions/` - Create action

### Kubernetes
- `GET /k8s/pods` - List pods in namespace
- `GET /k8s/deployments` - List deployments in namespace
- `GET /k8s/events` - List events in namespace
- `POST /k8s/pods/{name}/restart` - Restart a pod
- `POST /k8s/deployments/{name}/rollout-restart` - Rollout restart deployment
- `POST /k8s/deployments/{name}/scale` - Scale deployment

## Setup

1. Install dependencies:
   ```bash
   pip install -e .
   ```

2. Set up PostgreSQL database and update `.env` with correct DATABASE_URL

3. Set up OpenAI API key in `.env`:
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

4. Run database migrations:
   ```bash
   alembic revision --autogenerate -m "initial"
   alembic upgrade head
   ```

5. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `APP_NAME`: Application name
- `DEBUG`: Debug mode (true/false)
- `SECRET_KEY`: Secret key for security
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)
- `OPENAI_API_KEY`: OpenAI API key for AI analysis
- `KUBECONFIG_PATH`: Path to Kubernetes config file (optional, uses default if not set)

## AI Service

The AI service provides intelligent incident analysis with:

- **Input Processing**: Accepts metrics, logs, and context data
- **Root Cause Analysis**: Identifies underlying issues
- **Remediation Steps**: Provides actionable solutions
- **Confidence Scoring**: Rates analysis reliability (0.0-1.0)
- **Retry Logic**: Automatic retries on API failures
- **Timeout Protection**: Prevents hanging requests
- **Response Validation**: Ensures structured JSON output

### Example API Usage

```bash
# Analyze incident with custom data
curl -X POST "http://localhost:8000/analysis/incidents/1" \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": {"cpu_usage": 95, "memory_usage": 88},
    "logs": ["ERROR: Connection timeout", "WARN: High CPU usage"],
    "context": {"service": "web-api", "region": "us-east-1"}
  }'
```

Response:
```json
{
  "root_cause": "Database connection pool exhausted due to high concurrent requests",
  "remediation": "1. Increase connection pool size\n2. Implement request rate limiting\n3. Add database read replicas",
  "confidence": 0.87
}
```

## Kubernetes Integration

The Kubernetes service provides comprehensive cluster management capabilities:

- **Multi-Platform Support**: Compatible with EKS, GKE, AKS, and OpenShift
- **Kubeconfig Authentication**: Uses standard kubeconfig for cluster access
- **Resource Discovery**: Fetch pods, deployments, and events with filtering
- **Safe Operations**: Built-in checks prevent unsafe operations on managed resources
- **Retry Logic**: Automatic retries for transient API failures
- **Async Operations**: Non-blocking operations using thread pools

### Example API Usage

```bash
# List pods in a namespace
curl "http://localhost:8000/k8s/pods?namespace=production"

# Scale a deployment
curl -X POST "http://localhost:8000/k8s/deployments/my-app/scale" \
  -H "Content-Type: application/json" \
  -d '{"replicas": 3}'

# Rollout restart a deployment
curl -X POST "http://localhost:8000/k8s/deployments/my-app/rollout-restart?namespace=production"
```

### Safety Features

- **Controller Detection**: Prevents direct pod restarts for deployment-managed pods
- **Validation**: Input validation for scaling operations
- **Error Handling**: Comprehensive error reporting with actionable messages
- **Audit Trail**: Detailed operation logging for troubleshooting

## Development

For development, install dev dependencies:
```bash
pip install -e ".[dev]"
```

Run tests:
```bash
pytest
```