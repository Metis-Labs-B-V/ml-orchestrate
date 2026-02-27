from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils.text import slugify

from common_utils.base_model.models import BaseModel


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_verified", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)
    

class UserTypeChoices(models.TextChoices):
    ADMIN = "admin", "Admin"
    TENANT = "tenant", "Tenant"
    CUSTOMER = "customer", "Customer"


class User(BaseModel, AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, blank=True, default="")
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    avatar_url = models.URLField(blank=True, default="")
    timezone = models.CharField(max_length=100, blank=True, default="")
    locale = models.CharField(max_length=50, blank=True, default="")
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=64, blank=True, default="")
    sso_enabled = models.BooleanField(default=False)
    otp_enabled = models.BooleanField(default=False)
    user_type = models.CharField(max_length=50, null=True, blank=True, choices=UserTypeChoices.choices)
    job_title = models.CharField(max_length=150, blank=True, default="")
    

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email


class PasswordResetToken(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_tokens")
    token = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_used(self):
        return self.used_at is not None


class EmailVerificationToken(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="verification_tokens")
    token = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_used(self):
        return self.used_at is not None

    class Meta:
        ordering = ["-created_at"]
        db_table = "email_verification_token"


class LoginOTP(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_otps")
    otp = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    retries = models.IntegerField(default=0)

    @property
    def is_used(self):
        return self.used_at is not None

    class Meta:
        ordering = ["-created_at"]
        db_table = "login_otp"


class ImpersonationLog(BaseModel):
    impersonator = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="impersonation_logs"
    )
    target_user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="impersonated_logs"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")


class ActivityLog(BaseModel):
    tenant = models.ForeignKey(
        "Tenant", on_delete=models.SET_NULL, related_name="activity_logs", null=True, blank=True
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, related_name="activity_logs", null=True, blank=True
    )
    module = models.CharField(max_length=100)
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100, blank=True, default="")
    entity_id = models.CharField(max_length=100, blank=True, default="")
    description = models.TextField(blank=True, default="")
    metadata = models.JSONField(blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")


class SsoState(BaseModel):
    token = models.CharField(max_length=128, unique=True)
    provider = models.CharField(max_length=50)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)


class SsoLoginToken(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sso_logins")
    token = models.CharField(max_length=128, unique=True)
    provider = models.CharField(max_length=50)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)


class TenantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"


class Tenant(BaseModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )
    owner = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_tenants"
    )
    status = models.CharField(
        max_length=20, choices=TenantStatus.choices, default=TenantStatus.ACTIVE
    )
    metadata = models.JSONField(blank=True, null=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            count = (
                Tenant.objects.filter(slug__startswith=base_slug)
                .exclude(pk=self.pk)
                .count()
            )
            self.slug = f"{base_slug}-{count}" if count else base_slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class CustomerStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"


class Customer(BaseModel):
    name = models.CharField(max_length=255)
    vat = models.CharField(max_length=50, blank=True, default="")
    kvk = models.CharField(max_length=50, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    address_line_1 = models.CharField(max_length=255, blank=True, default="")
    address_line_2 = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    province = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    zip_code = models.CharField(max_length=20, blank=True, default="")

    slug = models.SlugField(max_length=255, unique=True, blank=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )
    tenant = models.ForeignKey(
        Tenant, null=True, blank=True, on_delete=models.SET_NULL, related_name="customers"
    )
    owner = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_customers"
    )
    status = models.CharField(
        max_length=50, choices=CustomerStatus.choices, default=CustomerStatus.ACTIVE
    )
    metadata = models.JSONField(blank=True, null=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            count = (
                Customer.objects.filter(slug__startswith=base_slug)
                .exclude(pk=self.pk)
                .count()
            )
            self.slug = f"{base_slug}-{count}" if count else base_slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
    
    class Meta:
        ordering = ["-created_at"]
        db_table = "customer"


class Permission(BaseModel):
    code = models.CharField(max_length=150, unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=100, blank=True, default="")

    def __str__(self):
        return self.code


class Role(BaseModel):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=150, blank=True)
    description = models.TextField(blank=True, default="")
    tenant = models.ForeignKey(
        Tenant, null=True, blank=True, on_delete=models.CASCADE, related_name="roles"
    )
    customer = models.ForeignKey(
        Customer, null=True, blank=True, on_delete=models.CASCADE, related_name="roles"
    )
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="children"
    )
    is_system = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "slug"],
                name="unique_tenant_role_slug",
            ),
            models.UniqueConstraint(
                fields=["customer", "slug"],
                name="unique_customer_role_slug",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class RolePermission(BaseModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission, on_delete=models.CASCADE, related_name="permission_roles"
    )

    class Meta:
        unique_together = ("role", "permission")


class UserTenant(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tenants")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="users")
    is_owner = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "tenant")


class UserCustomer(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="customers")
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="users")
    is_owner = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "customer")
        ordering = ["-created_at"]
        db_table = "user_customer"


class UserRole(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="users")
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="user_roles", null=True, blank=True
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="user_roles", null=True, blank=True
    )
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role", "tenant"],
                name="unique_user_tenant_role",
            ),
            models.UniqueConstraint(
                fields=["user", "role", "customer"],
                name="unique_user_customer_role",
            ),
        ]
