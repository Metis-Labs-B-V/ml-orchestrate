import { useEffect, useMemo } from "react";
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
  MLTable,
  MLTableBody,
  MLTableCell,
  MLTableHead,
  MLTableHeader,
  MLTableRow,
} from "ml-uikit";

import DashboardTable from "../../components/common/DashboardTable";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  deletePermission,
  deleteRole,
  fetchRolePermissions,
  fetchRolesData,
  resetPermissionForm,
  resetRoleForm,
  savePermission,
  saveRole,
  saveRolePermissions,
  setPermissionError,
  setPermissionStatus,
  setRolePermissionIds,
  setRoleError,
  setRoleStatus,
  setRoleTenantId,
  startEditPermission,
  startEditRole,
  toggleRolePermission,
  updatePermissionFormField,
  updateRoleFormField,
} from "../../store/slices/rolesSlice";
import type { DashboardPage } from "../../types/dashboard";

type Tenant = {
  id: number;
  name: string;
  slug?: string;
};

type Role = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  tenant?: number | null;
  is_system?: boolean;
  is_default?: boolean;
};

type Permission = {
  id: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
};

const Roles: DashboardPage = () => {
  const dispatch = useAppDispatch();
  const {
    tenants,
    roles,
    permissions,
    roleTenantId,
    roleForm,
    rolePermissionIds,
    editingRoleId,
    roleStatus,
    roleError,
    permissionForm,
    editingPermissionId,
    permissionStatus,
    permissionError,
    isLoading,
    error,
  } = useAppSelector((state) => state.roles);
  const user = useAppSelector((state) => state.session.user);
  const canManage = Boolean(user?.is_superuser);

  useEffect(() => {
    if (!canManage) {
      return;
    }
    dispatch(fetchRolesData());
  }, [canManage, dispatch]);

  useEffect(() => {
    if (!tenants.length) {
      return;
    }
    const defaultTenant = String(tenants[0].id);
    if (!roleTenantId) {
      dispatch(setRoleTenantId(defaultTenant));
    }
    if (!roleForm.tenant) {
      dispatch(updateRoleFormField({ field: "tenant", value: defaultTenant }));
    }
  }, [dispatch, roleForm.tenant, roleTenantId, tenants]);

  const tenantMap = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

  const filteredRoles = useMemo(() => {
    if (!roleTenantId) {
      return roles;
    }
    return roles.filter((role) => String(role.tenant ?? "") === roleTenantId);
  }, [roles, roleTenantId]);

  const sortedRoles = useMemo(
    () => [...filteredRoles].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredRoles]
  );

  const sortedPermissions = useMemo(
    () =>
      [...permissions].sort((a, b) =>
        `${a.category || ""}${a.code}`.localeCompare(`${b.category || ""}${b.code}`)
      ),
    [permissions]
  );

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of sortedPermissions) {
      const category = permission.category || "General";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)?.push(permission);
    }
    return Array.from(groups.entries());
  }, [sortedPermissions]);

  const roleFormTenantOptions = useMemo(() => tenants, [tenants]);

  const allPermissionIds = useMemo(
    () => permissions.map((permission) => permission.id),
    [permissions]
  );

  const readOnlyPermissionIds = useMemo(
    () =>
      permissions
        .filter((permission) => permission.code?.endsWith(".read"))
        .map((permission) => permission.id),
    [permissions]
  );

  useEffect(() => {
    if (!permissions.length) {
      return;
    }
    if (roleForm.is_system) {
      dispatch(setRolePermissionIds(allPermissionIds));
    } else if (roleForm.is_default) {
      dispatch(setRolePermissionIds(readOnlyPermissionIds));
    }
  }, [
    dispatch,
    permissions.length,
    roleForm.is_system,
    roleForm.is_default,
    allPermissionIds,
    readOnlyPermissionIds,
  ]);

  const handleResetRoleForm = () => {
    dispatch(resetRoleForm());
  };

  const loadRolePermissions = (roleId: number) => {
    dispatch(fetchRolePermissions({ roleId }));
  };

  const handleStartEditRole = (role: Role) => {
    dispatch(startEditRole(role));
    loadRolePermissions(role.id);
  };

  const handleSaveRolePermissions = async (roleId: number) => {
    const result = await dispatch(
      saveRolePermissions({ roleId, permissionIds: rolePermissionIds })
    )
      .unwrap()
      .then(() => true)
      .catch(() => false);
    return result;
  };

  const handleSaveRole = async () => {
    dispatch(setRoleStatus(""));
    dispatch(setRoleError(""));
    if (!roleForm.name.trim()) {
      dispatch(setRoleError("Role name is required."));
      return;
    }
    if (!roleForm.tenant) {
      dispatch(setRoleError("Select a tenant for the role."));
      return;
    }
    const payload: Record<string, unknown> = {
      name: roleForm.name,
      description: roleForm.description,
      tenant: Number(roleForm.tenant),
      is_default: roleForm.is_default,
      is_system: roleForm.is_system,
    };
    if (roleForm.slug.trim()) {
      payload.slug = roleForm.slug.trim();
    }
    const savedRole = await dispatch(
      saveRole({ payload, editingRoleId })
    )
      .unwrap()
      .catch(() => null);
    if (!savedRole) {
      return;
    }
    const roleId = editingRoleId || savedRole?.id;
    if (roleId) {
      const ok = await handleSaveRolePermissions(roleId);
      if (!ok) {
        return;
      }
    }
    if (!editingRoleId) {
      handleResetRoleForm();
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this role?");
      if (!confirmed) {
        return;
      }
    }
    dispatch(deleteRole({ roleId }));
  };

  const handleToggleRolePermission = (permissionId: number) => {
    dispatch(toggleRolePermission(permissionId));
  };

  const handleSystemRoleToggle = (value: boolean | string) => {
    const enabled = Boolean(value);
    dispatch(updateRoleFormField({ field: "is_system", value: enabled }));
    if (enabled) {
      dispatch(updateRoleFormField({ field: "is_default", value: false }));
      dispatch(setRolePermissionIds(allPermissionIds));
    } else {
      dispatch(setRolePermissionIds([]));
    }
  };

  const handleDefaultRoleToggle = (value: boolean | string) => {
    const enabled = Boolean(value);
    dispatch(updateRoleFormField({ field: "is_default", value: enabled }));
    if (enabled) {
      dispatch(updateRoleFormField({ field: "is_system", value: false }));
      dispatch(setRolePermissionIds(readOnlyPermissionIds));
    } else {
      dispatch(
        setRolePermissionIds(
          rolePermissionIds.filter(
            (permissionId) => !readOnlyPermissionIds.includes(permissionId)
          )
        )
      );
    }
  };

  const handleStartEditPermission = (permission: Permission) => {
    dispatch(startEditPermission(permission));
  };

  const handleResetPermissionForm = () => {
    dispatch(resetPermissionForm());
  };

  const handleSavePermission = async () => {
    dispatch(setPermissionStatus(""));
    dispatch(setPermissionError(""));
    if (!permissionForm.code.trim() || !permissionForm.name.trim()) {
      dispatch(setPermissionError("Permission code and name are required."));
      return;
    }
    const payload = {
      code: permissionForm.code.trim(),
      name: permissionForm.name.trim(),
      description: permissionForm.description.trim(),
      category: permissionForm.category.trim(),
    };
    const saved = await dispatch(
      savePermission({ payload, editingPermissionId })
    )
      .unwrap()
      .catch(() => null);
    if (!saved) {
      return;
    }
    if (!editingPermissionId) {
      handleResetPermissionForm();
    }
  };

  const handleDeletePermission = async (permissionId: number) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this permission?");
      if (!confirmed) {
        return;
      }
    }
    dispatch(deletePermission({ permissionId }));
  };

  return (
    <>
      {error ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Access error</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}

      {!canManage ? (
        <section className="dashboard-card">
          <p className="dashboard-muted">
            You do not have permission to manage roles and permissions.
          </p>
        </section>
      ) : (
        <>
          <section className="dashboard-profile">
            <MLCardTitle>Role management</MLCardTitle>
            {roleError ? (
              <MLAlert className="login-alert">
                <MLAlertTitle>Role action failed</MLAlertTitle>
                <MLAlertDescription>{roleError}</MLAlertDescription>
              </MLAlert>
            ) : null}
            {roleStatus ? (
              <MLAlert className="login-alert">
                <MLAlertTitle>Success</MLAlertTitle>
                <MLAlertDescription>{roleStatus}</MLAlertDescription>
              </MLAlert>
            ) : null}

            <div className="role-management-grid">
              <div className="dashboard-card">
                <div className="role-list-header">
                  <MLLabel>Tenant filter</MLLabel>
                  <MLSelect
                    value={roleTenantId}
                    onValueChange={(value) => dispatch(setRoleTenantId(value))}
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
                {isLoading ? (
                  <DashboardTable>
                    <div className="dashboard-grid dashboard-table-loading">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MLSkeleton key={index} className="h-6 w-full" />
                      ))}
                    </div>
                  </DashboardTable>
                ) : (
                  <DashboardTable>
                    <MLTable>
                      <MLTableHeader>
                        <MLTableRow>
                          <MLTableHead>Role</MLTableHead>
                          <MLTableHead>Tenant</MLTableHead>
                          <MLTableHead>Type</MLTableHead>
                          <MLTableHead>Actions</MLTableHead>
                        </MLTableRow>
                      </MLTableHeader>
                      <MLTableBody>
                        {sortedRoles.length ? (
                          sortedRoles.map((role) => (
                            <MLTableRow key={role.id}>
                              <MLTableCell>
                                <div>
                                  <strong>{role.name}</strong>
                                  <p className="dashboard-muted">{role.slug || "-"}</p>
                                </div>
                              </MLTableCell>
                              <MLTableCell>
                                {role.tenant
                                  ? tenantMap.get(role.tenant) || role.tenant
                                  : "Global"}
                              </MLTableCell>
                              <MLTableCell>
                                {role.is_system ? "System" : "Custom"}
                                {role.is_default ? " · Default" : ""}
                              </MLTableCell>
                              <MLTableCell>
                                <div className="role-table-actions">
                                  <MLButton
                                    variant="ghost"
                                    onClick={() => handleStartEditRole(role)}
                                  >
                                    Edit
                                  </MLButton>
                                  <MLButton
                                    variant="ghost"
                                    onClick={() => handleDeleteRole(role.id)}
                                  >
                                    Delete
                                  </MLButton>
                                </div>
                              </MLTableCell>
                            </MLTableRow>
                          ))
                        ) : (
                          <MLTableRow>
                            <MLTableCell colSpan={4}>No roles found.</MLTableCell>
                          </MLTableRow>
                        )}
                      </MLTableBody>
                    </MLTable>
                  </DashboardTable>
                )}
              </div>

              <div className="dashboard-card">
                <div className="role-form-header">
                  <MLCardTitle>{editingRoleId ? "Edit role" : "Create role"}</MLCardTitle>
                  {editingRoleId ? (
                    <MLButton variant="ghost" onClick={handleResetRoleForm}>
                      New role
                    </MLButton>
                  ) : null}
                </div>
                <div className="dashboard-grid">
                  <div className="dashboard-card">
                    <MLLabel htmlFor="role_name">Role name</MLLabel>
                    <MLInput
                      id="role_name"
                      value={roleForm.name}
                      onChange={(event) =>
                        dispatch(
                          updateRoleFormField({
                            field: "name",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel htmlFor="role_slug">Slug (optional)</MLLabel>
                    <MLInput
                      id="role_slug"
                      value={roleForm.slug}
                      onChange={(event) =>
                        dispatch(
                          updateRoleFormField({
                            field: "slug",
                            value: event.target.value,
                          })
                        )
                      }
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel htmlFor="role_description">Description</MLLabel>
                    <MLInput
                      id="role_description"
                      value={roleForm.description}
                      onChange={(event) =>
                        dispatch(
                          updateRoleFormField({
                            field: "description",
                            value: event.target.value,
                          })
                        )
                      }
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel>Tenant</MLLabel>
                    <MLSelect
                      value={roleForm.tenant}
                      onValueChange={(value) =>
                        dispatch(updateRoleFormField({ field: "tenant", value }))
                      }
                    >
                      <MLSelectTrigger>
                        <MLSelectValue placeholder="Select tenant" />
                      </MLSelectTrigger>
                      <MLSelectContent>
                        {roleFormTenantOptions.map((tenant) => (
                          <MLSelectItem key={tenant.id} value={String(tenant.id)}>
                            {tenant.name}
                          </MLSelectItem>
                        ))}
                      </MLSelectContent>
                    </MLSelect>
                  </div>
                </div>

                <div className="role-flags">
                  <label className="role-flag">
                    <MLCheckbox
                      checked={roleForm.is_default}
                      onCheckedChange={handleDefaultRoleToggle}
                    />
                    <span>Default role</span>
                  </label>
                  <label className="role-flag">
                    <MLCheckbox
                      checked={roleForm.is_system}
                      onCheckedChange={handleSystemRoleToggle}
                    />
                    <span>System role</span>
                  </label>
                </div>

                <div className="role-permissions">
                  <MLLabel>Role permissions</MLLabel>
                  {groupedPermissions.length ? (
                    groupedPermissions.map(([category, items]) => (
                      <div key={category} className="permission-group">
                        <p className="permission-group-title">{category}</p>
                        <div className="permission-list">
                          {items.map((permission) => (
                            <label key={permission.id} className="permission-item">
                              <MLCheckbox
                                checked={rolePermissionIds.includes(permission.id)}
                                onCheckedChange={() =>
                                  handleToggleRolePermission(permission.id)
                                }
                              />
                              <span className="permission-meta">
                                <span className="permission-code">
                                  {permission.code}
                                </span>
                                <span className="permission-desc">
                                  {permission.name || permission.description || ""}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="dashboard-muted">No permissions available.</p>
                  )}
                </div>

                <div className="role-form-actions">
                  <MLButton className="login-primary" onClick={handleSaveRole}>
                    {editingRoleId ? "Update role" : "Create role"}
                  </MLButton>
                  {editingRoleId ? (
                    <MLButton variant="outline" onClick={handleResetRoleForm}>
                      Clear
                    </MLButton>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="dashboard-profile">
            <MLCardTitle>Permissions catalog</MLCardTitle>
            {permissionError ? (
              <MLAlert className="login-alert">
                <MLAlertTitle>Permission action failed</MLAlertTitle>
                <MLAlertDescription>{permissionError}</MLAlertDescription>
              </MLAlert>
            ) : null}
            {permissionStatus ? (
              <MLAlert className="login-alert">
                <MLAlertTitle>Success</MLAlertTitle>
                <MLAlertDescription>{permissionStatus}</MLAlertDescription>
              </MLAlert>
            ) : null}

            <div className="permission-management-grid">
              <div className="dashboard-card">
                <MLCardTitle>
                  {editingPermissionId ? "Edit permission" : "Create permission"}
                </MLCardTitle>
                <div className="dashboard-grid">
                  <div className="dashboard-card">
                    <MLLabel htmlFor="perm_code">Code</MLLabel>
                    <MLInput
                      id="perm_code"
                      value={permissionForm.code}
                      onChange={(event) =>
                        dispatch(
                          updatePermissionFormField({
                            field: "code",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel htmlFor="perm_name">Name</MLLabel>
                    <MLInput
                      id="perm_name"
                      value={permissionForm.name}
                      onChange={(event) =>
                        dispatch(
                          updatePermissionFormField({
                            field: "name",
                            value: event.target.value,
                          })
                        )
                      }
                      required
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel htmlFor="perm_category">Category</MLLabel>
                    <MLInput
                      id="perm_category"
                      value={permissionForm.category}
                      onChange={(event) =>
                        dispatch(
                          updatePermissionFormField({
                            field: "category",
                            value: event.target.value,
                          })
                        )
                      }
                    />
                  </div>
                  <div className="dashboard-card">
                    <MLLabel htmlFor="perm_desc">Description</MLLabel>
                    <MLInput
                      id="perm_desc"
                      value={permissionForm.description}
                      onChange={(event) =>
                        dispatch(
                          updatePermissionFormField({
                            field: "description",
                            value: event.target.value,
                          })
                        )
                      }
                    />
                  </div>
                </div>
                <div className="role-form-actions">
                  <MLButton className="login-primary" onClick={handleSavePermission}>
                    {editingPermissionId ? "Update permission" : "Create permission"}
                  </MLButton>
                  {editingPermissionId ? (
                    <MLButton variant="outline" onClick={handleResetPermissionForm}>
                      Clear
                    </MLButton>
                  ) : null}
                </div>
              </div>

              <div className="dashboard-card">
                {isLoading ? (
                  <DashboardTable>
                    <div className="dashboard-grid dashboard-table-loading">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <MLSkeleton key={index} className="h-6 w-full" />
                      ))}
                    </div>
                  </DashboardTable>
                ) : (
                  <DashboardTable>
                    <MLTable>
                      <MLTableHeader>
                        <MLTableRow>
                          <MLTableHead>Permission</MLTableHead>
                          <MLTableHead>Category</MLTableHead>
                          <MLTableHead>Actions</MLTableHead>
                        </MLTableRow>
                      </MLTableHeader>
                      <MLTableBody>
                        {sortedPermissions.length ? (
                          sortedPermissions.map((permission) => (
                            <MLTableRow key={permission.id}>
                              <MLTableCell>
                                <div>
                                  <strong>{permission.code}</strong>
                                  <p className="dashboard-muted">
                                    {permission.name || permission.description || ""}
                                  </p>
                                </div>
                              </MLTableCell>
                              <MLTableCell>{permission.category || "General"}</MLTableCell>
                              <MLTableCell>
                                <div className="role-table-actions">
                                  <MLButton
                                    variant="ghost"
                                    onClick={() => handleStartEditPermission(permission)}
                                  >
                                    Edit
                                  </MLButton>
                                  <MLButton
                                    variant="ghost"
                                    onClick={() => handleDeletePermission(permission.id)}
                                  >
                                    Delete
                                  </MLButton>
                                </div>
                              </MLTableCell>
                            </MLTableRow>
                          ))
                        ) : (
                          <MLTableRow>
                            <MLTableCell colSpan={3}>No permissions found.</MLTableCell>
                          </MLTableRow>
                        )}
                      </MLTableBody>
                    </MLTable>
                  </DashboardTable>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
};

Roles.dashboardMeta = (t) => ({
  title: t("roles.title"),
  description: t("roles.subtitle"),
});

export default Roles;
