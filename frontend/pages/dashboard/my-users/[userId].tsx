import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLCheckbox,
  MLDialog,
  MLDialogContent,
  MLDialogDescription,
  MLDialogHeader,
  MLDialogTitle,
  MLDialogTrigger,
  MLInput,
  MLLabel,
  MLSelect,
  MLSelectContent,
  MLSelectItem,
  MLSelectTrigger,
  MLSelectValue,
  MLSkeleton,
} from "ml-uikit";

import { apiFetch } from "../../../lib/api";
import { API_PATHS } from "../../../lib/apiPaths";
import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  fetchRolesAndUser,
  fetchTenantsForUserEdit,
  resetState,
  setTenants,
  setSelectedTenantId,
  toggleRole,
  updateFormField,
  updateUser,
  updateUserRoles,
} from "../../../store/slices/userEditSlice";
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

type TenantUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  tenants?: Array<{
    id: number;
    name: string;
    roles?: Array<{ id: number; name: string; slug: string }>;
  }>;
};

const MyUsersEdit: DashboardPage = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const tenantIdParam = searchParams.get("tenantId") || "";
  const dispatch = useAppDispatch();
  const userId = useMemo(() => {
    if (!pathname) {
      return "";
    }
    return pathname.split("/").pop() || "";
  }, [pathname]);
  const { tenants, selectedTenantId, roles, roleIds, isLoading, error, status, form } =
    useAppSelector((state) => state.userEdit);
  const currentUser = useAppSelector((state) => state.session.user);
  const isSuperAdmin = Boolean(currentUser?.is_superuser);
  const canWrite = hasTenantWriteAccess(currentUser);
  const [deleteError, setDeleteError] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    dispatch(fetchTenantsForUserEdit()).then((action) => {
      if (fetchTenantsForUserEdit.fulfilled.match(action)) {
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
    if (!selectedTenantId || !userId) {
      return;
    }
    dispatch(fetchRolesAndUser({ tenantId: selectedTenantId, userId }));
  }, [dispatch, selectedTenantId, userId]);

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

  const handleSubmit = async () => {
    if (!selectedTenantId || !userId) {
      return;
    }
    if (!canWrite) {
      return;
    }
    const updated = await dispatch(
      updateUser({ tenantId: selectedTenantId, userId, form })
    )
      .unwrap()
      .catch(() => null);
    if (!updated) {
      return;
    }
    await dispatch(
      updateUserRoles({ tenantId: selectedTenantId, userId, roleIds })
    );
  };

  const handleDelete = async () => {
    if (!selectedTenantId || !userId) {
      return;
    }
    if (!canWrite) {
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    setDeleteStatus("");
    try {
      const response = await apiFetch(
        API_PATHS.tenants.userDetail(selectedTenantId, userId),
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Unable to remove user.");
      }
      setDeleteStatus("User removed.");
      setIsDeleteOpen(false);
      await router.push(
        selectedTenantId
          ? `/dashboard/my-users?tenantId=${selectedTenantId}`
          : "/dashboard/my-users"
      );
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to remove user.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canWrite) {
    return (
      <section className="dashboard-card">
        <p className="dashboard-muted">You do not have permission to update users.</p>
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
      {deleteError ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Action failed</MLAlertTitle>
          <MLAlertDescription>{deleteError}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {deleteStatus ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{deleteStatus}</MLAlertDescription>
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
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <MLLabel htmlFor="edit_email">Email</MLLabel>
            <MLInput
              id="edit_email"
              type="email"
              value={form.email}
              onChange={(event) =>
                dispatch(updateFormField({ field: "email", value: event.target.value }))
              }
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="edit_first">First name</MLLabel>
            <MLInput
              id="edit_first"
              value={form.first_name}
              onChange={(event) =>
                dispatch(updateFormField({ field: "first_name", value: event.target.value }))
              }
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="edit_last">Last name</MLLabel>
            <MLInput
              id="edit_last"
              value={form.last_name}
              onChange={(event) =>
                dispatch(updateFormField({ field: "last_name", value: event.target.value }))
              }
            />
          </div>
          <div className="dashboard-card">
            <MLLabel htmlFor="edit_active">Active</MLLabel>
            <MLCheckbox
              id="edit_active"
              checked={form.is_active}
              onCheckedChange={(value) =>
                dispatch(updateFormField({ field: "is_active", value: Boolean(value) }))
              }
            />
          </div>
          <div className="dashboard-card">
            <MLButton className="login-primary" onClick={handleSubmit}>
              Save user
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
              Back to list
            </MLButton>
            <MLDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <MLDialogTrigger asChild>
                <MLButton variant="ghost" disabled={!canWrite}>
                  Delete user
                </MLButton>
              </MLDialogTrigger>
              <MLDialogContent>
                <MLDialogHeader>
                  <MLDialogTitle>Delete user</MLDialogTitle>
                  <MLDialogDescription>
                    This will remove {form.email || "this user"} from the tenant.
                  </MLDialogDescription>
                </MLDialogHeader>
                <div className="tenant-dialog-actions">
                  <MLButton
                    variant="outline"
                    onClick={() => setIsDeleteOpen(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </MLButton>
                  <MLButton
                    className="tenant-add-button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Removing..." : "Confirm delete"}
                  </MLButton>
                </div>
              </MLDialogContent>
            </MLDialog>
          </div>
        </div>
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>Roles</MLCardTitle>
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

MyUsersEdit.dashboardMeta = {
  title: "Edit user",
  description: "Update user details and roles.",
};

export default MyUsersEdit;
