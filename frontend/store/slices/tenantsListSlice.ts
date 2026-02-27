import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type Tenant = {
  id: number;
  name: string;
  slug?: string;
  owner?: number | null;
  status?: string;
  created_at?: string;
  metadata?: {
    owner_name?: string;
    owner_email?: string;
    contact_number?: string;
  } | null;
};

type TenantsListState = {
  items: Tenant[];
  count: number;
  page: number;
  query: string;
  isLoading: boolean;
};

const initialState: TenantsListState = {
  items: [],
  count: 0,
  page: 1,
  query: "",
  isLoading: false,
};

export const fetchTenants = createAsyncThunk<
  { items: Tenant[]; count: number },
  { page: number },
  { rejectValue: string }
>("tenantsList/fetch", async ({ page }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.list(`page=${page}`));
    const payload = await response.json();
    const items = Array.isArray(payload?.data?.items)
      ? (payload.data.items as Tenant[])
      : Array.isArray(payload?.data)
        ? (payload.data as Tenant[])
        : [];
    const count =
      typeof payload?.data?.count === "number" ? payload.data.count : items.length;
    return { items, count };
  } catch (error) {
    return rejectWithValue("Unable to load tenants.");
  }
});

const tenantsListSlice = createSlice({
  name: "tenantsList",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenants.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.count = action.payload.count;
      })
      .addCase(fetchTenants.rejected, (state) => {
        state.isLoading = false;
        state.items = [];
        state.count = 0;
      });
  },
});

export const { setPage, setQuery, resetState } = tenantsListSlice.actions;
export default tenantsListSlice.reducer;
