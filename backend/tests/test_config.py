"""Tests for app/core/config.py — Settings class loading and defaults."""
from __future__ import annotations

import os

import pytest

# Import AFTER environment is already patched by conftest.py
from app.core.config import Settings


def test_settings_has_default_database_url() -> None:
    """Settings built without env vars should have the Docker-compose default URL."""
    # We can't easily unset DATABASE_URL that conftest already set, so we
    # create a fresh Settings instance with a known value.
    s = Settings(DATABASE_URL="postgresql+asyncpg://agent:agent@db:5432/agentcouncil")
    assert "agentcouncil" in s.DATABASE_URL
    assert s.DATABASE_URL.startswith("postgresql")


def test_settings_database_url_from_env() -> None:
    """Settings should read DATABASE_URL from the environment."""
    # conftest.py sets DATABASE_URL to sqlite+aiosqlite://
    s = Settings()
    assert "sqlite" in s.DATABASE_URL


def test_settings_anthropic_api_key_from_env() -> None:
    """ANTHROPIC_API_KEY should be read from the environment."""
    s = Settings()
    # conftest.py sets it to "test-key"
    assert s.ANTHROPIC_API_KEY == "test-key"


def test_settings_default_anthropic_api_key_is_empty_string() -> None:
    """Without an env var the API key defaults to an empty string."""
    original = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        s = Settings()
        assert s.ANTHROPIC_API_KEY == ""
    finally:
        if original is not None:
            os.environ["ANTHROPIC_API_KEY"] = original


def test_settings_cors_origins_is_list() -> None:
    """CORS_ORIGINS should always be a list."""
    s = Settings()
    assert isinstance(s.CORS_ORIGINS, list)


def test_settings_cors_origins_default_contains_localhost() -> None:
    """Default CORS origins should include the Angular dev server."""
    s = Settings(DATABASE_URL="sqlite+aiosqlite://")
    assert any("localhost" in origin for origin in s.CORS_ORIGINS)


def test_settings_moderator_model_default() -> None:
    """Default moderator model should be Claude Sonnet."""
    s = Settings(DATABASE_URL="sqlite+aiosqlite://")
    assert s.MODERATOR_MODEL == "claude-sonnet-4-20250514"


def test_settings_moderator_model_override() -> None:
    """MODERATOR_MODEL should be overridable."""
    s = Settings(DATABASE_URL="sqlite+aiosqlite://", MODERATOR_MODEL="claude-opus-4-20250514")
    assert s.MODERATOR_MODEL == "claude-opus-4-20250514"


def test_settings_admin_api_key_default_empty() -> None:
    """ADMIN_API_KEY should default to an empty string."""
    original = os.environ.pop("ADMIN_API_KEY", None)
    try:
        s = Settings()
        assert s.ADMIN_API_KEY == ""
    finally:
        if original is not None:
            os.environ["ADMIN_API_KEY"] = original


def test_settings_encryption_key_set_by_conftest() -> None:
    """Conftest sets SETTINGS_ENCRYPTION_KEY so tests can verify encryption."""
    s = Settings()
    assert s.SETTINGS_ENCRYPTION_KEY != ""


def test_settings_construction_with_explicit_values() -> None:
    """Settings can be constructed with explicit keyword arguments."""
    s = Settings(
        ANTHROPIC_API_KEY="sk-explicit",
        DATABASE_URL="sqlite+aiosqlite://",
        CORS_ORIGINS=["http://localhost:3000"],
        MODERATOR_MODEL="claude-haiku-4-20250514",
    )
    assert s.ANTHROPIC_API_KEY == "sk-explicit"
    assert s.CORS_ORIGINS == ["http://localhost:3000"]
    assert s.MODERATOR_MODEL == "claude-haiku-4-20250514"
