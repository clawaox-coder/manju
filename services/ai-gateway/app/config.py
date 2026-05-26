from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "local"
    http_port: int = 8005
    jwt_public_key_path: str = "/run/secrets/jwt-public.pem"
    jwt_issuer: str = "manju-auth"
    anthropic_api_key: str = "sk-placeholder"
    anthropic_model: str = "claude-sonnet-4-6"
    cors_origins: str = "http://localhost:5173,http://localhost:5174"
    log_level: str = "info"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
