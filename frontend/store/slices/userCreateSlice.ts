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

type UserCreateForm = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

type UserCreateState = {
  tenants: TenantOption[];
  selectedTenantId: string;
  roles: Role[];
  roleIds: number[];
  form: UserCreateForm;
  isLoading: boolean;
  error: string;
  status: string;
};

const initialState: UserCreateState = {
  tenants: [],
  selectedTenantId: "",
  roles: [],
  roleIds: [],
  form: {
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  },
  isLoading: false,
  error: "",
  status: "",
};

export const fetchTenantsForUserCreate = createAsyncThunk<
  TenantOption[],
  void,
  { rejectValue: string }
>("userCreate/fetchTenants", async (_, { rejectWithValue }) => {
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

export const fetchRolesForTenant = createAsyncThunk<
  Role[],
  { tenantId: string },
  { rejectValue: string }
>("userCreate/fetchRoles", async ({ tenantId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.roles(tenantId));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load roles.");
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items as Role[];
    }
    if (Array.isArray(payload?.data)) {
      return payload.data as Role[];
    }
    return [];
  } catch (error) {
    return rejectWithValue("Unable to load roles.");
  }
});

export const createTenantUser = createAsyncThunk<
  string,
  { tenantId: string; form: UserCreateForm; roleIds: number[] },
  { rejectValue: string }
>(
  "userCreate/createUser",
  async ({ tenantId, form, roleIds }, { rejectWithValue }) => {
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
      };
      if (roleIds.length) {
        payload.role_ids = roleIds;
      }
      const response = await apiFetch(API_PATHS.tenants.users(tenantId), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        return rejectWithValue(body?.message || "Unable to create user.");
      }
      return "User created.";
    } catch (error) {
      return rejectWithValue("Unable to create user.");
    }
  }
);

const userCreateSlice = createSlice({
  name: "userCreate",
  initialState,
  reducers: {
    setTenants(state, action: PayloadAction<TenantOption[]>) {
      state.tenants = action.payload;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
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
      action: PayloadAction<{ field: keyof UserCreateForm; value: string }>
    ) {
      state.form[action.payload.field] = action.payload.value;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantsForUserCreate.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchTenantsForUserCreate.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tenants = action.payload;
      })
      .addCase(fetchTenantsForUserCreate.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load tenants.";
      })
      .addCase(fetchRolesForTenant.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchRolesForTenant.fulfilled, (state, action) => {
        state.isLoading = false;
        state.roles = action.payload;
      })
      .addCase(fetchRolesForTenant.rejected, (state) => {
        state.isLoading = false;
        state.roles = [];
      })
      .addCase(createTenantUser.pending, (state) => {
        state.isLoading = true;
        state.status = "";
        state.error = "";
      })
      .addCase(createTenantUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.status = action.payload;
      })
      .addCase(createTenantUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to create user.";
      });
  },
});

export const {
  setTenants,
  setError,
  setSelectedTenantId,
  toggleRole,
  updateFormField,
  resetState,
} = userCreateSlice.actions;
export default userCreateSlice.reducer;
