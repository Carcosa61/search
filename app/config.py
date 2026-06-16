import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://monitoring:changeme@localhost:5432/monitoring"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "change-this-secret-key"
    openai_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    alert_email_to: str = ""

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
