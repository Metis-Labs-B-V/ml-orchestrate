import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type TenantOption = {
  id: number;
  name: string;
  slug?: string;
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

type UsersListState = {
  tenants: TenantOption[];
  selectedTenantId: string;
  tenantUsers: TenantUser[];
  count: number;
  page: number;
  isLoading: boolean;
  error: string;
};

const initialState: UsersListState = {
  tenants: [],
  selectedTenantId: "",
  tenantUsers: [],
  count: 0,
  page: 1,
  isLoading: false,
  error: "",
};

export const fetchTenantsForUsers = createAsyncThunk<
  TenantOption[],
  void,
  { rejectValue: string }
>("usersList/fetchTenants", async (_, { rejectWithValue }) => {
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

export const fetchTenantUsers = createAsyncThunk<
  { items: TenantUser[]; count: number },
  { tenantId: string; page: number; pageSize: number },
  { rejectValue: string }
>(
  "usersList/fetchTenantUsers",
  async ({ tenantId, page, pageSize }, { rejectWithValue }) => {
    try {
      const response = await apiFetch(
        API_PATHS.tenants.users(
          tenantId,
          `page=${page}&page_size=${pageSize}`
        )
      );
      const payload = await response.json();
      if (!response.ok) {
        return rejectWithValue(payload?.message || "Unable to load tenant users.");
      }
      const items = Array.isArray(payload?.data?.items)
        ? (payload.data.items as TenantUser[])
        : Array.isArray(payload?.data)
          ? (payload.data as TenantUser[])
          : [];
      const count =
        typeof payload?.data?.count === "number" ? payload.data.count : items.length;
      return { items, count };
    } catch (error) {
      return rejectWithValue("Unable to load tenant users.");
    }
  }
);

const usersListSlice = createSlice({
  name: "usersList",
  initialState,
  reducers: {
    setTenants(state, action: PayloadAction<TenantOption[]>) {
      state.tenants = action.payload;
    },
    setSelectedTenantId(state, action: PayloadAction<string>) {
      state.selectedTenantId = action.payload;
    },
    clearUsers(state) {
      state.tenantUsers = [];
      state.count = 0;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantsForUsers.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchTenantsForUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tenants = action.payload;
      })
      .addCase(fetchTenantsForUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load tenants.";
      })
      .addCase(fetchTenantUsers.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchTenantUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tenantUsers = action.payload.items;
        state.count = action.payload.count;
      })
      .addCase(fetchTenantUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load tenant users.";
      });
  },
});

export const { setTenants, setSelectedTenantId, clearUsers, setPage, resetState } =
  usersListSlice.actions;
export default usersListSlice.reducer;
