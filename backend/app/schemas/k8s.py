from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime


class PodInfo(BaseModel):
    name: str
    namespace: str
    status: str
    ready_containers: str
    restarts: int
    age: str
    node: Optional[str] = None

    class Config:
        from_attributes = True


class DeploymentInfo(BaseModel):
    name: str
    namespace: str
    replicas: str
    available: int
    ready: int
    age: str

    class Config:
        from_attributes = True


class EventInfo(BaseModel):
    name: str
    namespace: str
    type: str
    reason: str
    message: str
    source: str
    first_seen: str
    last_seen: str
    count: int

    class Config:
        from_attributes = True


class ScaleDeploymentRequest(BaseModel):
    replicas: int


class K8sOperationResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


class ClusterCredentialPayload(BaseModel):
    api_server_url: Optional[str] = None
    bearer_token: Optional[str] = None
    ca_cert: Optional[str] = None
    namespace: Optional[str] = None
    skip_tls_verify: bool = False


class ClusterOnboardingValidateRequest(BaseModel):
    cluster_name: str
    cluster_type: str
    auth_method: str
    kubeconfig_content: Optional[str] = None
    service_account: Optional[ClusterCredentialPayload] = None


class ClusterValidationResponse(BaseModel):
    success: bool
    message: str
    cluster_name: str
    cluster_type: str
    auth_method: str
    server_version: Optional[str] = None
    namespace_count: Optional[int] = None
    sample_namespaces: List[str] = []


class ClusterOnboardingConfirmResponse(BaseModel):
    success: bool
    message: str
    cluster_name: str
    cluster_type: str
    auth_method: str
    validated_at: datetime