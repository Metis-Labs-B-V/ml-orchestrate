from drf_spectacular.extensions import OpenApiAuthenticationExtension


class JWEJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "identity.authentication.JWEJWTAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
