from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from .jwe import decrypt_token


class JWEJWTAuthentication(JWTAuthentication):
    def get_validated_token(self, raw_token):
        try:
            raw_token = decrypt_token(raw_token)
        except Exception as exc:
            raise InvalidToken("Invalid token") from exc
        return super().get_validated_token(raw_token)
