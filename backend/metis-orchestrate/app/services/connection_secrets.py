import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.utils import timezone


class ConnectionSecretError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class SecretPayloadResult:
    payload: dict[str, Any]
    migrated: bool


def _derive_fernet() -> Fernet:
    if not getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", False):
        raise ConnectionSecretError("Secret encryption is disabled.")

    raw_key = str(getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_KEY", "") or "").strip()
    if not raw_key:
        raise ConnectionSecretError(
            "ORCHESTRATE_SECRET_ENCRYPTION_KEY must be configured when encryption is enabled."
        )

    try:
        encoded = raw_key.encode("utf-8")
        if len(raw_key) == 44:
            return Fernet(encoded)
    except Exception:
        pass

    digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return payload


def encrypt_secret_payload(payload: dict[str, Any]) -> str:
    normalized = _normalize_payload(payload)
    if not getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", False):
        return json.dumps(normalized, sort_keys=True)
    serialized = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return _derive_fernet().encrypt(serialized.encode("utf-8")).decode("utf-8")


def decrypt_secret_payload(ciphertext: str) -> dict[str, Any]:
    if not ciphertext:
        return {}
    if not getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", False):
        try:
            return _normalize_payload(json.loads(ciphertext))
        except json.JSONDecodeError as exc:
            raise ConnectionSecretError("Stored secret payload is not valid JSON.") from exc
    try:
        plaintext = _derive_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ConnectionSecretError("Stored secret payload could not be decrypted.") from exc
    try:
        return _normalize_payload(json.loads(plaintext))
    except json.JSONDecodeError as exc:
        raise ConnectionSecretError("Stored secret payload is not valid JSON.") from exc


def set_connection_secret_payload(connection, payload: dict[str, Any]) -> None:
    normalized = _normalize_payload(payload)
    if getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", False):
        connection.encrypted_secret_payload = encrypt_secret_payload(normalized)
        connection.secret_payload = {}
        connection.secret_payload_migrated_at = timezone.now()
        return
    connection.secret_payload = normalized


def get_connection_secret_payload(connection, *, persist_migration: bool = True) -> SecretPayloadResult:
    encrypted_payload = str(getattr(connection, "encrypted_secret_payload", "") or "").strip()
    if encrypted_payload:
        return SecretPayloadResult(payload=decrypt_secret_payload(encrypted_payload), migrated=False)

    legacy_payload = _normalize_payload(getattr(connection, "secret_payload", {}) or {})
    if not legacy_payload:
        return SecretPayloadResult(payload={}, migrated=False)

    if not getattr(settings, "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", False):
        return SecretPayloadResult(payload=legacy_payload, migrated=False)

    set_connection_secret_payload(connection, legacy_payload)
    if persist_migration:
        connection.save(
            update_fields=[
                "encrypted_secret_payload",
                "secret_payload",
                "secret_payload_migrated_at",
                "updated_at",
            ]
        )
    return SecretPayloadResult(payload=legacy_payload, migrated=True)
