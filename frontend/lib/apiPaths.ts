const API_V1 = "/api/v1";

const withQuery = (path: string, query?: string) => {
  if (!query) {
    return path;
  }
  const cleaned = query.startsWith("?") ? query.slice(1) : query;
  return `${path}?${cleaned}`;
};

export const API_PATHS = {
  auth: {
    login: `${API_V1}/auth/login/`,
    refresh: `${API_V1}/auth/refresh/`,
    logout: `${API_V1}/auth/logout/`,
    me: `${API_V1}/auth/me/`,
    signup: `${API_V1}/auth/signup/`,
    forgotPassword: `${API_V1}/auth/forgot-password/`,
    resetPassword: `${API_V1}/auth/reset-password/`,
    verifyLoginOtp: `${API_V1}/auth/verify-login-otp/`,
    mfaVerifyLogin: `${API_V1}/auth/mfa/verify-login/`,
    mfaSetup: `${API_V1}/auth/mfa/setup/`,
    mfaConfirm: `${API_V1}/auth/mfa/confirm/`,
    mfaDisable: `${API_V1}/auth/mfa/disable/`,
    mfaToggle: `${API_V1}/auth/mfa/`,
    ssoToggle: `${API_V1}/auth/sso/`,
    impersonationUsers: `${API_V1}/auth/impersonation/users/`,
    impersonate: `${API_V1}/auth/impersonate/`,
    ssoStart: (provider: "google" | "microsoft") =>
      `${API_V1}/auth/sso/${provider}/start/`,
    ssoExchange: `${API_V1}/auth/sso/exchange/`,
    onboard: `${API_V1}/auth/onboard/`,
    onboardCustomer: `${API_V1}/auth/onboard-customer/`,
  },
  tenant: {
    verifyEmail: `${API_V1}/tenant/verify-email/`,
    sendEmailVerificationLink: `${API_V1}/tenant/send-email-verification-link/`,
  },
  tenants: {
    list: (query?: string) => withQuery(`${API_V1}/tenants/`, query),
    detail: (tenantId: string | number) => `${API_V1}/tenants/${tenantId}/`,
    roles: (tenantId: string | number) =>
      `${API_V1}/tenants/${tenantId}/roles/`,
    users: (tenantId: string | number, query?: string) =>
      withQuery(`${API_V1}/tenants/${tenantId}/users/`, query),
    userDetail: (tenantId: string | number, userId: string | number) =>
      `${API_V1}/tenants/${tenantId}/users/${userId}/`,
    userRoles: (tenantId: string | number, userId: string | number) =>
      `${API_V1}/tenants/${tenantId}/users/${userId}/roles/`,
  },
  customers: {
    list: (query?: string) => withQuery(`${API_V1}/customers/`, query),
    detail: (customerId: string | number) => `${API_V1}/customers/${customerId}/`,
    roles: (customerId: string | number) =>
      `${API_V1}/customers/${customerId}/roles/`,
    users: (customerId: string | number, query?: string) =>
      withQuery(`${API_V1}/customers/${customerId}/users/`, query),
    userDetail: (customerId: string | number, userId: string | number) =>
      `${API_V1}/customers/${customerId}/users/${userId}/`,
    userRoles: (customerId: string | number, userId: string | number) =>
      `${API_V1}/customers/${customerId}/users/${userId}/roles/`,
  },
  roles: {
    list: (query?: string) => withQuery(`${API_V1}/roles/`, query),
    detail: (roleId: string | number) => `${API_V1}/roles/${roleId}/`,
    permissions: (roleId: string | number) =>
      `${API_V1}/roles/${roleId}/permissions/`,
  },
  permissions: {
    list: (query?: string) => withQuery(`${API_V1}/permissions/`, query),
    detail: (permissionId: string | number) =>
      `${API_V1}/permissions/${permissionId}/`,
  },
  activityLogs: (query?: string) =>
    withQuery(`${API_V1}/activity/logs/`, query),
  impersonationLogs: (query?: string) =>
    withQuery(`${API_V1}/impersonation/logs/`, query),
};
