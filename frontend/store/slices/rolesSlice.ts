import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

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

type RoleFormState = {
  name: string;
  slug: string;
  description: string;
  tenant: string;
  is_default: boolean;
  is_system: boolean;
};

type PermissionFormState = {
  code: string;
  name: string;
  description: string;
  category: string;
};

const emptyRoleForm: RoleFormState = {
  name: "",
  slug: "",
  description: "",
  tenant: "",
  is_default: false,
  is_system: false,
};

const emptyPermissionForm: PermissionFormState = {
  code: "",
  name: "",
  description: "",
  category: "",
};

type RolesState = {
  tenants: Tenant[];
  roles: Role[];
  permissions: Permission[];
  roleTenantId: string;
  roleForm: RoleFormState;
  rolePermissionIds: number[];
  editingRoleId: number | null;
  roleStatus: string;
  roleError: string;
  permissionForm: PermissionFormState;
  editingPermissionId: number | null;
  permissionStatus: string;
  permissionError: string;
  isLoading: boolean;
  error: string;
};

const initialState: RolesState = {
  tenants: [],
  roles: [],
  permissions: [],
  roleTenantId: "",
  roleForm: emptyRoleForm,
  rolePermissionIds: [],
  editingRoleId: null,
  roleStatus: "",
  roleError: "",
  permissionForm: emptyPermissionForm,
  editingPermissionId: null,
  permissionStatus: "",
  permissionError: "",
  isLoading: false,
  error: "",
};

export const fetchRolesData = createAsyncThunk<
  { tenants: Tenant[]; roles: Role[]; permissions: Permission[] },
  void,
  { rejectValue: string }
>("roles/fetchData", async (_, { rejectWithValue }) => {
  try {
    const [tenantsResponse, rolesResponse, permissionsResponse] = await Promise.all([
      apiFetch(API_PATHS.tenants.list("page_size=100")),
      apiFetch(API_PATHS.roles.list("page_size=100")),
      apiFetch(API_PATHS.permissions.list("page_size=100")),
    ]);
    const tenantsPayload = tenantsResponse.ok ? await tenantsResponse.json() : null;
    const rolesPayload = rolesResponse.ok ? await rolesResponse.json() : null;
    const permissionsPayload = permissionsResponse.ok ? await permissionsResponse.json() : null;
    if (!tenantsResponse.ok || !rolesResponse.ok || !permissionsResponse.ok) {
      return rejectWithValue("Unable to load roles and permissions.");
    }
    const tenants = Array.isArray(tenantsPayload?.data?.items)
      ? (tenantsPayload.data.items as Tenant[])
      : Array.isArray(tenantsPayload?.data)
        ? (tenantsPayload.data as Tenant[])
        : [];
    const roles = Array.isArray(rolesPayload?.data?.items)
      ? (rolesPayload.data.items as Role[])
      : Array.isArray(rolesPayload?.data)
        ? (rolesPayload.data as Role[])
        : [];
    const permissions = Array.isArray(permissionsPayload?.data?.items)
      ? (permissionsPayload.data.items as Permission[])
      : Array.isArray(permissionsPayload?.data)
        ? (permissionsPayload.data as Permission[])
        : [];
    return { tenants, roles, permissions };
  } catch (error) {
    return rejectWithValue("Unable to load roles and permissions.");
  }
});

export const fetchRolePermissions = createAsyncThunk<
  number[],
  { roleId: number },
  { rejectValue: string }
>("roles/fetchRolePermissions", async ({ roleId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.roles.permissions(roleId));
    if (!response.ok) {
      return rejectWithValue("Unable to load role permissions.");
    }
    const payload = await response.json();
    return payload?.data?.permission_ids || [];
  } catch (error) {
    return rejectWithValue("Unable to load role permissions.");
  }
});

export const saveRole = createAsyncThunk<
  Role,
  { payload: Record<string, unknown>; editingRoleId: number | null },
  { rejectValue: string }
>("roles/saveRole", async ({ payload, editingRoleId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(
      editingRoleId ? API_PATHS.roles.detail(editingRoleId) : API_PATHS.roles.list(),
      {
        method: editingRoleId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to save role.");
    }
    return body?.data as Role;
  } catch (error) {
    return rejectWithValue("Unable to save role.");
  }
});

export const saveRolePermissions = createAsyncThunk<
  void,
  { roleId: number; permissionIds: number[] },
  { rejectValue: string }
>("roles/saveRolePermissions", async ({ roleId, permissionIds }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.roles.permissions(roleId), {
      method: "POST",
      body: JSON.stringify({ permission_ids: permissionIds }),
    });
    if (!response.ok) {
      const payload = await response.json();
      return rejectWithValue(payload?.message || "Unable to update role permissions.");
    }
    return;
  } catch (error) {
    return rejectWithValue("Unable to update role permissions.");
  }
});

export const deleteRole = createAsyncThunk<
  number,
  { roleId: number },
  { rejectValue: string }
>("roles/deleteRole", async ({ roleId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.roles.detail(roleId), {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      return rejectWithValue(payload?.message || "Unable to delete role.");
    }
    return roleId;
  } catch (error) {
    return rejectWithValue("Unable to delete role.");
  }
});

export const savePermission = createAsyncThunk<
  Permission,
  { payload: Record<string, unknown>; editingPermissionId: number | null },
  { rejectValue: string }
>("roles/savePermission", async ({ payload, editingPermissionId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(
      editingPermissionId
        ? API_PATHS.permissions.detail(editingPermissionId)
        : API_PATHS.permissions.list(),
      {
        method: editingPermissionId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to save permission.");
    }
    return body?.data as Permission;
  } catch (error) {
    return rejectWithValue("Unable to save permission.");
  }
});

export const deletePermission = createAsyncThunk<
  number,
  { permissionId: number },
  { rejectValue: string }
>("roles/deletePermission", async ({ permissionId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.permissions.detail(permissionId), {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      return rejectWithValue(payload?.message || "Unable to delete permission.");
    }
    return permissionId;
  } catch (error) {
    return rejectWithValue("Unable to delete permission.");
  }
});

const rolesSlice = createSlice({
  name: "roles",
  initialState,
  reducers: {
    setRoleTenantId(state, action: PayloadAction<string>) {
      state.roleTenantId = action.payload;
    },
    setRoleStatus(state, action: PayloadAction<string>) {
      state.roleStatus = action.payload;
    },
    setRoleError(state, action: PayloadAction<string>) {
      state.roleError = action.payload;
    },
    setPermissionStatus(state, action: PayloadAction<string>) {
      state.permissionStatus = action.payload;
    },
    setPermissionError(state, action: PayloadAction<string>) {
      state.permissionError = action.payload;
    },
    updateRoleFormField(
      state,
      action: PayloadAction<{ field: keyof RoleFormState; value: string | boolean }>
    ) {
      state.roleForm[action.payload.field] = action.payload.value as never;
    },
    updatePermissionFormField(
      state,
      action: PayloadAction<{ field: keyof PermissionFormState; value: string }>
    ) {
      state.permissionForm[action.payload.field] = action.payload.value;
    },
    setRolePermissionIds(state, action: PayloadAction<number[]>) {
      state.rolePermissionIds = action.payload;
    },
    toggleRolePermission(state, action: PayloadAction<number>) {
      if (state.rolePermissionIds.includes(action.payload)) {
        state.rolePermissionIds = state.rolePermissionIds.filter(
          (id) => id !== action.payload
        );
      } else {
        state.rolePermissionIds = [...state.rolePermissionIds, action.payload];
      }
    },
    startEditRole(state, action: PayloadAction<Role>) {
      state.editingRoleId = action.payload.id;
      state.roleForm = {
        name: action.payload.name || "",
        slug: action.payload.slug || "",
        description: action.payload.description || "",
        tenant: action.payload.tenant ? String(action.payload.tenant) : state.roleTenantId,
        is_default: Boolean(action.payload.is_default),
        is_system: Boolean(action.payload.is_system),
      };
      state.rolePermissionIds = [];
      state.roleStatus = "";
      state.roleError = "";
    },
    resetRoleForm(state) {
      state.editingRoleId = null;
      state.roleForm = {
        ...emptyRoleForm,
        tenant: state.roleForm.tenant || state.roleTenantId,
      };
      state.rolePermissionIds = [];
      state.roleStatus = "";
      state.roleError = "";
    },
    startEditPermission(state, action: PayloadAction<Permission>) {
      state.editingPermissionId = action.payload.id;
      state.permissionForm = {
        code: action.payload.code || "",
        name: action.payload.name || "",
        description: action.payload.description || "",
        category: action.payload.category || "",
      };
      state.permissionStatus = "";
      state.permissionError = "";
    },
    resetPermissionForm(state) {
      state.editingPermissionId = null;
      state.permissionForm = emptyPermissionForm;
      state.permissionStatus = "";
      state.permissionError = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRolesData.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchRolesData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tenants = action.payload.tenants;
        state.roles = action.payload.roles;
        state.permissions = action.payload.permissions;
      })
      .addCase(fetchRolesData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load roles and permissions.";
      })
      .addCase(fetchRolePermissions.fulfilled, (state, action) => {
        state.rolePermissionIds = action.payload;
      })
      .addCase(fetchRolePermissions.rejected, (state, action) => {
        state.roleError = action.payload || "Unable to load role permissions.";
      })
      .addCase(saveRole.pending, (state) => {
        state.roleStatus = "";
        state.roleError = "";
      })
      .addCase(saveRole.fulfilled, (state, action) => {
        if (state.editingRoleId) {
          state.roles = state.roles.map((role) =>
            role.id === state.editingRoleId ? action.payload : role
          );
          state.roleStatus = "Role updated.";
        } else {
          state.roles = [action.payload, ...state.roles];
          state.roleStatus = "Role created.";
        }
      })
      .addCase(saveRole.rejected, (state, action) => {
        state.roleError = action.payload || "Unable to save role.";
      })
      .addCase(saveRolePermissions.rejected, (state, action) => {
        state.roleError = action.payload || "Unable to update role permissions.";
      })
      .addCase(deleteRole.fulfilled, (state, action) => {
        state.roles = state.roles.filter((role) => role.id !== action.payload);
        if (state.editingRoleId === action.payload) {
          state.editingRoleId = null;
          state.roleForm = emptyRoleForm;
          state.rolePermissionIds = [];
        }
      })
      .addCase(deleteRole.rejected, (state, action) => {
        state.roleError = action.payload || "Unable to delete role.";
      })
      .addCase(savePermission.pending, (state) => {
        state.permissionStatus = "";
        state.permissionError = "";
      })
      .addCase(savePermission.fulfilled, (state, action) => {
        if (state.editingPermissionId) {
          state.permissions = state.permissions.map((permission) =>
            permission.id === state.editingPermissionId ? action.payload : permission
          );
          state.permissionStatus = "Permission updated.";
        } else {
          state.permissions = [action.payload, ...state.permissions];
          state.permissionStatus = "Permission created.";
        }
      })
      .addCase(savePermission.rejected, (state, action) => {
        state.permissionError = action.payload || "Unable to save permission.";
      })
      .addCase(deletePermission.fulfilled, (state, action) => {
        state.permissions = state.permissions.filter(
          (permission) => permission.id !== action.payload
        );
        if (state.editingPermissionId === action.payload) {
          state.editingPermissionId = null;
          state.permissionForm = emptyPermissionForm;
        }
      })
      .addCase(deletePermission.rejected, (state, action) => {
        state.permissionError = action.payload || "Unable to delete permission.";
      });
  },
});

export const {
  setRoleTenantId,
  setRoleStatus,
  setRoleError,
  setPermissionStatus,
  setPermissionError,
  updateRoleFormField,
  updatePermissionFormField,
  setRolePermissionIds,
  toggleRolePermission,
  startEditRole,
  resetRoleForm,
  startEditPermission,
  resetPermissionForm,
} = rolesSlice.actions;
export default rolesSlice.reducer;
