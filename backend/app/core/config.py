from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "AutonOps Backend - A junior SRE that never sleeps"
    debug: bool = False
    secret_key: str
    database_url: str
    log_level: str = "INFO"
    openai_api_key: str
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