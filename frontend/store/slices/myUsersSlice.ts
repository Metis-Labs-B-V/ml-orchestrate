import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type Role = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
};

type TenantRole = Role;

type UserTenantInfo = {
  id: number;
  name: string;
  roles?: Role[];
};

export type MyUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  job_title?: string;
  is_active?: boolean;
  updated_at?: string;
  tenants?: UserTenantInfo[];
};

type MyUsersState = {
  items: MyUser[];
  count: number;
  page: number;
  pageSize: number;
  query: string;
  statusFilter: string;
  roles: TenantRole[];
  isLoading: boolean;
  error: string;
};

const DEFAULT_PAGE_SIZE = 20;

const initialState: MyUsersState = {
  items: [],
  count: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  query: "",
  statusFilter: "all",
  roles: [],
  isLoading: false,
  error: "",
};

export const fetchTenantRoles = createAsyncThunk<
  TenantRole[],
  { tenantId: string },
  { rejectValue: string }
>("myUsers/fetchTenantRoles", async ({ tenantId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.roles(tenantId));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load user groups.");
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items as TenantRole[];
    }
    if (Array.isArray(payload?.data)) {
      return payload.data as TenantRole[];
    }
    return [];
  } catch (error) {
    return rejectWithValue("Unable to load user groups.");
  }
});

export const fetchMyUsers = createAsyncThunk<
  { items: MyUser[]; count: number },
  { tenantId: string; page: number; pageSize: number; query: string; statusFilter: string },
  { rejectValue: string }
>("myUsers/fetch", async (filters, { rejectWithValue }) => {
  try {
    const params = new URLSearchParams();
    params.set("page", String(filters.page));
    params.set("page_size", String(filters.pageSize));
    if (filters.query.trim()) {
      params.set("search", filters.query.trim());
    }
    if (filters.statusFilter !== "all") {
      params.set("is_active", filters.statusFilter);
    }
    const response = await apiFetch(
      API_PATHS.tenants.users(filters.tenantId, params.toString())
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load users.");
    }
    const items = Array.isArray(payload?.data?.items)
      ? (payload.data.items as MyUser[])
      : Array.isArray(payload?.data)
        ? (payload.data as MyUser[])
        : [];
    const count =
      typeof payload?.data?.count === "number" ? payload.data.count : items.length;
    return { items, count };
  } catch (error) {
    return rejectWithValue("Unable to load users.");
  }
});

export const createMyUser = createAsyncThunk<
  MyUser,
  {
    tenantId: string;
    payload: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      job_title?: string;
      role_ids?: number[];
      send_invite?: boolean;
    };
  },
  { rejectValue: string }
>("myUsers/create", async ({ tenantId, payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.users(tenantId), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to create user.");
    }
    return body?.data as MyUser;
  } catch (error) {
    return rejectWithValue("Unable to create user.");
  }
});

export const updateMyUser = createAsyncThunk<
  MyUser,
  {
    tenantId: string;
    userId: number;
    payload: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      job_title?: string;
    };
  },
  { rejectValue: string }
>("myUsers/update", async ({ tenantId, userId, payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.userDetail(tenantId, userId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to update user.");
    }
    return body?.data as MyUser;
  } catch (error) {
    return rejectWithValue("Unable to update user.");
  }
});

export const updateMyUserRoles = createAsyncThunk<
  void,
  { tenantId: string; userId: number; roleIds: number[] },
  { rejectValue: string }
>("myUsers/updateRoles", async ({ tenantId, userId, roleIds }, { rejectWithValue }) => {
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

export const deleteMyUser = createAsyncThunk<
  number,
  { tenantId: string; userId: number },
  { rejectValue: string }
>("myUsers/delete", async ({ tenantId, userId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.userDetail(tenantId, userId), {
      method: "DELETE",
    });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to delete user.");
    }
    return userId;
  } catch (error) {
    return rejectWithValue("Unable to delete user.");
  }
});

const myUsersSlice = createSlice({
  name: "myUsers",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    setStatusFilter(state, action: PayloadAction<string>) {
      state.statusFilter = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantRoles.pending, (state) => {
        state.error = "";
      })
      .addCase(fetchTenantRoles.fulfilled, (state, action) => {
        state.roles = action.payload;
      })
      .addCase(fetchTenantRoles.rejected, (state, action) => {
        state.error = action.payload || "Unable to load user groups.";
      })
      .addCase(fetchMyUsers.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchMyUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.count = action.payload.count;
      })
      .addCase(fetchMyUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.items = [];
        state.count = 0;
        state.error = action.payload || "Unable to load users.";
      })
      .addCase(createMyUser.pending, (state) => {
        state.error = "";
      })
      .addCase(createMyUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to create user.";
      })
      .addCase(updateMyUser.pending, (state) => {
        state.error = "";
      })
      .addCase(updateMyUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to update user.";
      })
      .addCase(updateMyUserRoles.rejected, (state, action) => {
        state.error = action.payload || "Unable to update user roles.";
      })
      .addCase(deleteMyUser.fulfilled, (state, action) => {
        state.items = state.items.filter((user) => user.id !== action.payload);
        state.count = Math.max(0, state.count - 1);
      })
      .addCase(deleteMyUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to delete user.";
      });
  },
});

export const { setPage, setQuery, setStatusFilter, resetState } = myUsersSlice.actions;
export default myUsersSlice.reducer;
