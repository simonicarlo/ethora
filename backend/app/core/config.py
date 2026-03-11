from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "postgresql+asyncpg://agent:agent@db:5432/agentcouncil"
    CORS_ORIGINS: list[str] = ["http://localhost:4200"]
    MODERATOR_MODEL: str = "claude-sonnet-4-20250514"
    SETTINGS_ENCRYPTION_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
