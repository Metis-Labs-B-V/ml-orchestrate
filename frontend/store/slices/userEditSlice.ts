import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

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

type UserEditForm = {
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
};

type UserEditState = {
  tenants: TenantOption[];
  selectedTenantId: string;
  roles: Role[];
  roleIds: number[];
  form: UserEditForm;
  isLoading: boolean;
  error: string;
  status: string;
};

const initialState: UserEditState = {
  tenants: [],
  selectedTenantId: "",
  roles: [],
  roleIds: [],
  form: {
    email: "",
    first_name: "",
    last_name: "",
    is_active: true,
  },
  isLoading: false,
  error: "",
  status: "",
};

export const fetchTenantsForUserEdit = createAsyncThunk<
  TenantOption[],
  void,
  { rejectValue: string }
>("userEdit/fetchTenants", async (_, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.list("page_size=100"));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load tenants.");
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items as TenantOption[];
    }
    if (Array.isArray(payload?.data)) {
      return payload.data as TenantOption[];
    }
    return [];
  } catch (error) {
    return rejectWithValue("Unable to load tenants.");
  }
});

export const fetchRolesAndUser = createAsyncThunk<
  { roles: Role[]; user: TenantUser | null },
  { tenantId: string; userId: string },
  { rejectValue: string }
>("userEdit/fetchRolesAndUser", async ({ tenantId, userId }, { rejectWithValue }) => {
  try {
    const [rolesResponse, userResponse] = await Promise.all([
      apiFetch(API_PATHS.tenants.roles(tenantId)),
      apiFetch(API_PATHS.tenants.userDetail(tenantId, userId)),
    ]);
    const rolesPayload = rolesResponse.ok ? await rolesResponse.json() : null;
    const userPayload = userResponse.ok ? await userResponse.json() : null;
    if (!rolesResponse.ok || !userResponse.ok) {
      return rejectWithValue("Unable to load user details.");
    }
    const roles = Array.isArray(rolesPayload?.data?.items)
      ? (rolesPayload.data.items as Role[])
      : Array.isArray(rolesPayload?.data)
        ? (rolesPayload.data as Role[])
        : [];
    const user = userPayload?.data as TenantUser | undefined;
    return { roles, user: user || null };
  } catch (error) {
    return rejectWithValue("Unable to load user details.");
  }
});

export const updateUser = createAsyncThunk<
  TenantUser,
  { tenantId: string; userId: string; form: UserEditForm },
  { rejectValue: string }
>("userEdit/updateUser", async ({ tenantId, userId, form }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.userDetail(tenantId, userId), {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to update user.");
    }
    return payload?.data as TenantUser;
  } catch (error) {
    return rejectWithValue("Unable to update user.");
  }
});

export const updateUserRoles = createAsyncThunk<
  void,
  { tenantId: string; userId: string; roleIds: number[] },
  { rejectValue: string }
>("userEdit/updateUserRoles", async ({ tenantId, userId, roleIds }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.userRoles(tenantId, userId), {
      method: "POST",
      body: JSON.stringify({ role_ids: roleIds }),
    });
    if (!response.ok) {
      const payload = await response.json();
      return rejectWithValue(payload?.message || "Unable to update user roles.");
    }
    return;
  } catch (error) {
    return rejectWithValue("Unable to update user roles.");
  }
});

const userEditSlice = createSlice({
  name: "userEdit",
  initialState,
  reducers: {
    setTenants(state, action: PayloadAction<TenantOption[]>) {
      state.tenants = action.payload;
    },
    setSelectedTenantId(state, action: PayloadAction<string>) {
      state.selectedTenantId = action.payload;
    },
    toggleRole(state, action: PayloadAction<number>) {
      if (state.roleIds.includes(action.payload)) {
        state.roleIds = state.roleIds.filter((id) => id !== action.payload);
      } else {
        state.roleIds = [...state.roleIds, action.payload];
      }
    },
    updateFormField(
      state,
      action: PayloadAction<{ field: keyof UserEditForm; value: string | boolean }>
    ) {
      state.form[action.payload.field] = action.payload.value as never;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantsForUserEdit.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchTenantsForUserEdit.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tenants = action.payload;
      })
      .addCase(fetchTenantsForUserEdit.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load tenants.";
      })
      .addCase(fetchRolesAndUser.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchRolesAndUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.roles = action.payload.roles;
        const user = action.payload.user;
        if (user) {
          state.form = {
            email: user.email || "",
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            is_active: user.is_active ?? true,
          };
          const tenantRoles =
            user.tenants
              ?.find((tenant) => String(tenant.id) === state.selectedTenantId)
              ?.roles?.map((role) => role.id) || [];
          state.roleIds = tenantRoles;
        }
      })
      .addCase(fetchRolesAndUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load user details.";
      })
      .addCase(updateUser.pending, (state) => {
        state.isLoading = true;
        state.error = "";
        state.status = "";
      })
      .addCase(updateUser.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to update user.";
      })
      .addCase(updateUserRoles.fulfilled, (state) => {
        state.status = "User updated.";
      })
      .addCase(updateUserRoles.rejected, (state, action) => {
        state.error = action.payload || "Unable to update user roles.";
      });
  },
});

export const { setTenants, setSelectedTenantId, toggleRole, updateFormField, resetState } =
  userEditSlice.actions;
export default userEditSlice.reducer;
