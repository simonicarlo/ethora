"""Fernet symmetric encryption for sensitive settings stored at rest."""
from __future__ import annotations

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet() -> Fernet:
    key = settings.SETTINGS_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string, returning the Fernet token as a string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str:
    """Decrypt a Fernet token string back to plaintext."""
    return _get_fernet().decrypt(token.encode()).decode()
