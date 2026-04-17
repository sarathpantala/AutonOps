from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "AutonOps Backend - A junior SRE that never sleeps"
    debug: bool = False
    secret_key: str
    database_url: str
    log_level: str = "INFO"

    # AI providers — at least one must be configured
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    ai_provider: str = "openai"  # openai | claude

    kubeconfig_path: Optional[str] = None
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()