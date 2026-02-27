from identity.models import Tenant, Role, Permission, RolePermission, UserRole

tenant_admin_permissions = {"user.read", "user.write", "customer.read", "customer.write", "role.read"}
tenant_finance_permissions = {"customer.read", "user.read"}
tenant_other_permissions = {"customer.read", "user.read"}

customer_admin_permissions = {"user.read", "user.write", "customer.read", "customer.write"}
customer_finance_permissions = {"customer.read"}
customer_other_permissions = {"customer.read"}


def create_roles_and_permissions_for_tenant(tenant, owner):
    tenant_admin_role = Role.objects.create(name="Admin", tenant=tenant, slug="tenant-admin")
    tenant_finance_role = Role.objects.create(name="Finance", tenant=tenant, slug="tenant-finance")
    tenant_other_role = Role.objects.create(name="Other", tenant=tenant, slug="tenant-other")
    
    for permission in tenant_admin_permissions:
        RolePermission.objects.create(role=tenant_admin_role, permission=Permission.objects.get(code=permission))
    for permission in tenant_finance_permissions:
        RolePermission.objects.create(role=tenant_finance_role, permission=Permission.objects.get(code=permission))
    for permission in tenant_other_permissions:
        RolePermission.objects.create(role=tenant_other_role, permission=Permission.objects.get(code=permission))

    UserRole.objects.create(user=owner, role=tenant_admin_role, tenant=tenant)
    return True





def create_roles_and_permissions_for_customer(customer, owner):
    customer_admin_role = Role.objects.create(name="Admin", customer=customer, slug="customer-admin")
    customer_finance_role = Role.objects.create(name="Finance", customer=customer, slug="customer-finance")
    customer_other_role = Role.objects.create(name="Other", customer=customer, slug="customer-other")
    
    for permission in customer_admin_permissions:
        RolePermission.objects.create(role=customer_admin_role, permission=Permission.objects.get(code=permission))
    for permission in customer_finance_permissions:
        RolePermission.objects.create(role=customer_finance_role, permission=Permission.objects.get(code=permission))
    for permission in customer_other_permissions:
        RolePermission.objects.create(role=customer_other_role, permission=Permission.objects.get(code=permission))

    if owner:
        UserRole.objects.create(user=owner, role=customer_admin_role, customer=customer)
    return True
