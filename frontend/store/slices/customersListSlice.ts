import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type ClientMetadata = {
  owner_name?: string;
  owner_email?: string;
  contact_number?: string;
};

export type Client = {
  id: number;
  name: string;
  status?: string;
  is_active?: boolean;
  metadata?: ClientMetadata | null;
};

type CustomersListState = {
  items: Client[];
  count: number;
  page: number;
  pageSize: number;
  query: string;
  statusFilter: string;
  isLoading: boolean;
  error: string;
};

const DEFAULT_PAGE_SIZE = 20;

const initialState: CustomersListState = {
  items: [],
  count: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  query: "",
  statusFilter: "all",
  isLoading: false,
  error: "",
};

export const fetchCustomers = createAsyncThunk<
  { items: Client[]; count: number },
  {
    page: number;
    pageSize: number;
    query: string;
    statusFilter: string;
  },
  { rejectValue: string }
>("customersList/fetch", async (filters, { rejectWithValue }) => {
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
    const response = await apiFetch(API_PATHS.customers.list(params.toString()));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load clients.");
    }
    const items = Array.isArray(payload?.data?.items)
      ? (payload.data.items as Client[])
      : Array.isArray(payload?.data)
        ? (payload.data as Client[])
        : [];
    const count =
      typeof payload?.data?.count === "number" ? payload.data.count : items.length;
    return { items, count };
  } catch (error) {
    return rejectWithValue("Unable to load clients.");
  }
});

export const deleteCustomer = createAsyncThunk<
  number,
  { id: number },
  { rejectValue: string }
>("customersList/delete", async ({ id }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.detail(id), {
      method: "DELETE",
    });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to delete client.");
    }
    return id;
  } catch (error) {
    return rejectWithValue("Unable to delete client.");
  }
});

const customersListSlice = createSlice({
  name: "customersList",
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
      .addCase(fetchCustomers.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.count = action.payload.count;
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load clients.";
        state.items = [];
        state.count = 0;
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        state.items = state.items.filter((client) => client.id !== action.payload);
        state.count = Math.max(0, state.count - 1);
      });
  },
});

export const {
  setPage,
  setQuery,
  setStatusFilter,
  resetState,
} = customersListSlice.actions;
export default customersListSlice.reducer;
