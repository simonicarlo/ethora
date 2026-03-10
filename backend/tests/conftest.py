"""Pytest configuration — sets DATABASE_URL before any app imports."""
from __future__ import annotations

import os

# Override DATABASE_URL to use in-memory SQLite for all tests.
# This must happen before any app module is imported, because
# database.py eagerly creates the engine at module level.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["ANTHROPIC_API_KEY"] = "test-key"
