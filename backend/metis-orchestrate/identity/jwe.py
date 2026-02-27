import base64
import hashlib
from typing import Union

from django.conf import settings
from jwcrypto import jwk, jwe

JWE_ALG = "dir"
JWE_ENC = "A256GCM"


def _derive_key(secret: str) -> jwk.JWK:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return jwk.JWK(kty="oct", k=key)


def _get_secret() -> str:
    secret = getattr(settings, "JWE_SECRET", "") or settings.SECRET_KEY
    if not secret:
        raise ValueError("JWE secret is required")
    return secret


def _is_enabled() -> bool:
    return bool(getattr(settings, "JWE_ENABLED", False))


def _coerce_token(token: Union[str, bytes]) -> str:
    if isinstance(token, bytes):
        return token.decode("utf-8")
    return token


def is_jwe_token(token: Union[str, bytes]) -> bool:
    token_str = _coerce_token(token)
    return token_str.count(".") == 4


def encrypt_token(token: Union[str, bytes]) -> str:
    token_str = _coerce_token(token)
    if not _is_enabled():
        return token_str
    key = _derive_key(_get_secret())
    jwe_token = jwe.JWE(
        token_str.encode("utf-8"),
        protected={"alg": JWE_ALG, "enc": JWE_ENC, "cty": "JWT"},
    )
    jwe_token.add_recipient(key)
    return jwe_token.serialize(compact=True)


def decrypt_token(token: Union[str, bytes]) -> str:
    token_str = _coerce_token(token)
    if not _is_enabled() or not is_jwe_token(token_str):
        return token_str
    key = _derive_key(_get_secret())
    jwe_token = jwe.JWE()
    jwe_token.deserialize(token_str)
    jwe_token.decrypt(key)
    return jwe_token.payload.decode("utf-8")
