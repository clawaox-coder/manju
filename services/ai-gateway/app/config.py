from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "local"
    http_port: int = 8005
    jwt_public_key_path: str = "/run/secrets/jwt-public.pem"
    # 私钥用于签发 service-to-service token(后台任务调 asset-service 取参考图)。
    # 留空表示无 S2S 能力(取图会降级)。dev 专用,生产环境不应下放私钥(见 design)。
    jwt_private_key_path: str = ""
    jwt_issuer: str = "manju-auth"
    # asset-service 内网地址(取项目参考图)。
    asset_service_url: str = "http://localhost:8004"
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
    # 中转网关(如 packyapi)常按官方 SDK 的 User-Agent 指纹拦截(返 403)。
    # 覆盖成非 SDK UA 即可绕过;留空则不覆盖(直连官方 api.anthropic.com 时应留空)。
    anthropic_user_agent: str = ""
    openai_api_key: str = ""
    # 图像生成上游(OpenAI 兼容)。默认直连 OpenAI;可指向中转网关(如 packyapi)。
    # base_url 末尾不含 /generations|/edits,由 image.py 拼接。
    openai_image_base_url: str = "https://api.openai.com/v1/images"
    openai_image_model: str = "gpt-image-1"
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173"
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
