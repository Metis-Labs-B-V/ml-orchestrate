type RoleInfo = {
  slug?: string;
  name?: string;
};

type TenantInfo = {
  is_owner?: boolean;
  roles?: RoleInfo[];
  permissions?: string[];
};

type UserProfile = {
  is_superuser?: boolean;
  tenants?: TenantInfo[];
  customers?: TenantInfo[];
};

const ADMIN_ROLE_SLUGS = new Set([
  "super-admin",
  "superadmin",
  "admin",
  "tenant-admin",
  "owner",
]);

const USER_READ_CODES = new Set(["user.read", "user.write"]);
const USER_WRITE_CODES = new Set(["user.write"]);
const TENANT_WRITE_CODES = new Set(["tenant.write", "user.write"]);
const AUDIT_READ_CODES = new Set(["audit.read"]);

const hasPermission = (user: UserProfile | null | undefined, codes: Set<string>) => {
  if (!user) {
    return false;
  }
  if (user.is_superuser) {
    return true;
  }
  const permissions = [
    ...(user.tenants?.flatMap((tenant) => tenant.permissions || []) || []),
    ...(user.customers?.flatMap((customer) => customer.permissions || []) || []),
  ];
  if (permissions.some((code) => codes.has(code))) {
    return true;
  }
  const roles = [
    ...(user.tenants?.flatMap((tenant) => tenant.roles || []) || []),
    ...(user.customers?.flatMap((customer) => customer.roles || []) || []),
  ];
  return roles.some((role) =>
    ADMIN_ROLE_SLUGS.has((role.slug || role.name || "").toLowerCase())
  );
};

const hasTenantPermission = (user: UserProfile | null | undefined, codes: Set<string>) => {
  if (!user) {
    return false;
  }
  if (user.is_superuser) {
    return true;
  }
  const permissions = user.tenants?.flatMap((tenant) => tenant.permissions || []) || [];
  if (permissions.some((code) => codes.has(code))) {
    return true;
  }
  if (user.tenants?.some((tenant) => tenant.is_owner)) {
    return true;
  }
  const roles = user.tenants?.flatMap((tenant) => tenant.roles || []) || [];
  return roles.some((role) =>
    ADMIN_ROLE_SLUGS.has((role.slug || role.name || "").toLowerCase())
  );
};

export function hasUserAccess(user?: UserProfile | null) {
  return hasPermission(user, USER_READ_CODES);
}

export function hasUserWriteAccess(user?: UserProfile | null) {
  return hasPermission(user, USER_WRITE_CODES);
}

export function hasTenantWriteAccess(user?: UserProfile | null) {
  return hasTenantPermission(user, TENANT_WRITE_CODES);
}

export function hasTenantUserAccess(user?: UserProfile | null) {
  return hasTenantPermission(user, USER_READ_CODES);
}

export function hasAuditAccess(user?: UserProfile | null) {
  return hasPermission(user, AUDIT_READ_CODES);
}
