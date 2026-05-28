from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "local"
    http_port: int = 8005
    jwt_public_key_path: str = "/run/secrets/jwt-public.pem"
    jwt_issuer: str = "manju-auth"
    database_url: str = "postgres://manju_app:manju_app@localhost:5432/manju?sslmode=disable"
    anthropic_api_key: str = "sk-placeholder"
    # OAuth 风格 token + 自定义 endpoint. 用于复用 Claude Code / 中转网关凭据.
    # 留空表示走默认 (api_key + api.anthropic.com).
    anthropic_auth_token: str = ""
    anthropic_base_url: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    # anthropic-beta header (启用 1m 上下文等 beta 特性). 留空走默认.
    # 中转网关可能要求显式 flag, 不能由 model 名 [1m] 后缀替代.
    anthropic_beta: str = ""
    openai_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:5174"
    log_level: str = "info"

    @property
    def has_real_anthropic_key(self) -> bool:
        # 真凭据 = api_key 非占位 或 auth_token 非空.
        api_key_ok = bool(self.anthropic_api_key) and not self.anthropic_api_key.startswith("sk-placeholder")
        auth_token_ok = bool(self.anthropic_auth_token)
        return api_key_ok or auth_token_ok

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
