from rest_framework import serializers


class EmptySerializer(serializers.Serializer):
    pass


class LoginRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class RefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class TokenPayloadRequestSerializer(serializers.Serializer):
    token = serializers.CharField(required=False, allow_blank=True)
    access = serializers.CharField(required=False, allow_blank=True)
    refresh = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        token = attrs.get("token") or attrs.get("access") or attrs.get("refresh")
        if not token:
            raise serializers.ValidationError(
                {"token": ["One of token/access/refresh is required."]}
            )
        return attrs


class ToggleEnabledRequestSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False, default=False)


class ChangePasswordRequestSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField()


class VerifyLoginOtpRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()
    otp = serializers.CharField()


class ImpersonateUserRequestSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


class RoleIdsRequestSerializer(serializers.Serializer):
    role_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=True,
    )


class OnboardTenantRequestSerializer(serializers.Serializer):
    tenant = serializers.DictField()
    owner = serializers.DictField()


class OnboardCustomerRequestSerializer(serializers.Serializer):
    customer = serializers.DictField()
    owner = serializers.DictField()
    tenant_id = serializers.IntegerField(required=False, allow_null=True)
