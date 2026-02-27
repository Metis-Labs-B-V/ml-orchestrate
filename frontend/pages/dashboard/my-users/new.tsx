import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLCheckbox,
  MLInput,
  MLLabel,
  MLSelect,
  MLSelectContent,
  MLSelectItem,
  MLSelectTrigger,
  MLSelectValue,
  MLSkeleton,
} from "ml-uikit";

import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  createTenantUser,
  fetchRolesForTenant,
  fetchTenantsForUserCreate,
  resetState,
  setError,
  setSelectedTenantId,
  setTenants,
  toggleRole,
  updateFormField,
} from "../../../store/slices/userCreateSlice";
import type { DashboardPage } from "../../../types/dashboard";

type TenantOption = {
  id: number;
  name: string;
  slug?: string;
};

type Role = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
};

const MyUsersCreate: DashboardPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantIdParam = searchParams.get("tenantId") || "";
  const dispatch = useAppDispatch();
  const { tenants, selectedTenantId, roles, roleIds, isLoading, error, status, form } =
    useAppSelector((state) => state.userCreate);
  const currentUser = useAppSelector((state) => state.session.user);
  const isSuperAdmin = Boolean(currentUser?.is_superuser);
  const canWrite = hasTenantWriteAccess(currentUser);

  useEffect(() => {
    if (currentUser?.is_superuser) {
      return;
    }
    const userTenants =
      currentUser?.tenants?.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      })) || [];
    if (userTenants.length) {
      dispatch(setTenants(userTenants));
    }
    if (tenantIdParam && userTenants.some((tenant) => String(tenant.id) === tenantIdParam)) {
      dispatch(setSelectedTenantId(tenantIdParam));
      return;
    }
    if (userTenants.length) {
      dispatch(setSelectedTenantId(String(userTenants[0].id)));
    }
  }, [currentUser, dispatch, tenantIdParam]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }
    dispatch(fetchTenantsForUserCreate()).then((action) => {
      if (fetchTenantsForUserCreate.fulfilled.match(action)) {
        const tenantItems = action.payload;
        if (
          tenantIdParam &&
          tenantItems.some((tenant) => String(tenant.id) === tenantIdParam)
        ) {
          dispatch(setSelectedTenantId(tenantIdParam));
          return;
        }
        if (tenantItems.length) {
          dispatch(setSelectedTenantId(String(tenantItems[0].id)));
        }
      }
    });
  }, [dispatch, isSuperAdmin, tenantIdParam]);

  useEffect(() => {
    if (!selectedTenantId) {
      return;
    }
    dispatch(fetchRolesForTenant({ tenantId: selectedTenantId }));
  }, [dispatch, selectedTenantId]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const tenantName = useMemo(
    () => tenants.find((tenant) => String(tenant.id) === selectedTenantId)?.name,
    [tenants, selectedTenantId]
  );

  const handleToggleRole = (roleId: number) => {
    dispatch(toggleRole(roleId));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) {
      dispatch(setError("You do not have permission to create users."));
      return;
    }
    if (!selectedTenantId) {
      dispatch(setError("Select a tenant first."));
      return;
    }
    const result = await dispatch(
      createTenantUser({ tenantId: selectedTenantId, form, roleIds })
    )
      .unwrap()
      .catch(() => null);
    if (!result) {
      return;
    }
    await router.push(
      selectedTenantId
        ? `/dashboard/my-users?tenantId=${selectedTenantId}`
        : "/dashboard/my-users"
    );
  };

  if (!canWrite) {
    return (
      <section className="dashboard-card">
        <p className="dashboard-muted">You do not have permission to create users.</p>
      </section>
    );
  }

  return (
    <>
      {error ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Action failed</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {status ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{status}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <section className="dashboard-profile">
        <MLCardTitle>Tenant</MLCardTitle>
        {tenants.length ? (
          <div className="dashboard-card">
            <MLLabel>Tenant</MLLabel>
            <MLSelect
              value={selectedTenantId}
              onValueChange={(value) => dispatch(setSelectedTenantId(value))}
              disabled={!isSuperAdmin && tenants.length <= 1}
            >
              <MLSelectTrigger>
                <MLSelectValue placeholder="Select tenant" />
              </MLSelectTrigger>
              <MLSelectContent>
                {tenants.map((tenant) => (
                  <MLSelectItem key={tenant.id} value={String(tenant.id)}>
                    {tenant.name}
                  </MLSelectItem>
                ))}
              </MLSelectContent>
            </MLSelect>
          </div>
        ) : (
          <div className="dashboard-card">
            <p className="dashboard-muted">No tenants available.</p>
          </div>
        )}
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>User details</MLCardTitle>
        <form className="dashboard-grid" onSubmit={handleSubmit}>
          <div className="dashboard-card">
            <MLLabel htmlFor="user_email">Email</MLLabel>
            <MLInput
              id="user_email"
              type="email"
              value={form.email}
              onChange={(event) =>
                dispatch(updateFormField({ field: "email", value: event.target.value }))
              }
              required
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="user_first">First name</MLLabel>
            <MLInput
              id="user_first"
              value={form.first_name}
              onChange={(event) =>
                dispatch(
                  updateFormField({ field: "first_name", value: event.target.value })
                )
              }
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="user_last">Last name</MLLabel>
            <MLInput
              id="user_last"
              value={form.last_name}
              onChange={(event) =>
                dispatch(
                  updateFormField({ field: "last_name", value: event.target.value })
                )
              }
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="user_password">Password</MLLabel>
            <MLInput
              id="user_password"
              type="password"
              value={form.password}
              onChange={(event) =>
                dispatch(
                  updateFormField({ field: "password", value: event.target.value })
                )
              }
              required
            />
          </div>
          <div className="dashboard-card">
            <MLButton type="submit" className="login-primary">
              Create user
            </MLButton>
            <MLButton
              variant="ghost"
              onClick={() =>
                router.push(
                  selectedTenantId
                    ? `/dashboard/my-users?tenantId=${selectedTenantId}`
                    : "/dashboard/my-users"
                )
              }
            >
              Cancel
            </MLButton>
          </div>
        </form>
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>Assign roles</MLCardTitle>
        <div className="dashboard-card">
          {isLoading ? (
            <div className="dashboard-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <MLSkeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : roles.length ? (
            <div className="permission-list">
              {roles.map((role) => (
                <label key={role.id} className="permission-item">
                  <MLCheckbox
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={() => handleToggleRole(role.id)}
                  />
                  <span className="permission-meta">
                    <span className="permission-code">{role.name}</span>
                    <span className="permission-desc">{role.description || role.slug}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="dashboard-muted">No roles available for this tenant.</p>
          )}
        </div>
      </section>
    </>
  );
};

MyUsersCreate.dashboardMeta = {
  title: "Create user",
  description: "Create and assign a user to a tenant.",
};

export default MyUsersCreate;
