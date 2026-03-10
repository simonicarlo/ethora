from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "postgresql+asyncpg://agent:agent@db:5432/agentcouncil"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
