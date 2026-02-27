import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type Role = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
};

type UserClientInfo = {
  id: number;
  name: string;
  roles?: Role[];
};

export type ClientUser = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  job_title?: string;
  is_active?: boolean;
  updated_at?: string;
  customers?: UserClientInfo[];
};

type ClientUsersState = {
  items: ClientUser[];
  count: number;
  page: number;
  pageSize: number;
  query: string;
  statusFilter: string;
  roles: Role[];
  isLoading: boolean;
  error: string;
  modalMode: "add" | "edit" | null;
  editUserId: number | null;
};

const DEFAULT_PAGE_SIZE = 20;

const initialState: ClientUsersState = {
  items: [],
  count: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  query: "",
  statusFilter: "all",
  roles: [],
  isLoading: false,
  error: "",
  modalMode: null,
  editUserId: null,
};

export const fetchClientRoles = createAsyncThunk<
  Role[],
  { clientId: string },
  { rejectValue: string }
>("clientUsers/fetchRoles", async ({ clientId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.roles(clientId));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load user groups.");
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items as Role[];
    }
    if (Array.isArray(payload?.data)) {
      return payload.data as Role[];
    }
    return [];
  } catch (error) {
    return rejectWithValue("Unable to load user groups.");
  }
});

export const fetchClientUsers = createAsyncThunk<
  { items: ClientUser[]; count: number },
  { clientId: string; page: number; pageSize: number; query: string; statusFilter: string },
  { rejectValue: string }
>("clientUsers/fetch", async (filters, { rejectWithValue }) => {
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
      API_PATHS.customers.users(filters.clientId, params.toString())
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load users.");
    }
    const items = Array.isArray(payload?.data?.items)
      ? (payload.data.items as ClientUser[])
      : Array.isArray(payload?.data)
        ? (payload.data as ClientUser[])
        : [];
    const count =
      typeof payload?.data?.count === "number" ? payload.data.count : items.length;
    return { items, count };
  } catch (error) {
    return rejectWithValue("Unable to load users.");
  }
});

export const createClientUser = createAsyncThunk<
  ClientUser,
  {
    clientId: string;
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
>("clientUsers/create", async ({ clientId, payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.users(clientId), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to create user.");
    }
    return body?.data as ClientUser;
  } catch (error) {
    return rejectWithValue("Unable to create user.");
  }
});

export const updateClientUser = createAsyncThunk<
  ClientUser,
  {
    clientId: string;
    userId: number;
    payload: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      job_title?: string;
      is_active?: boolean;
    };
  },
  { rejectValue: string }
>("clientUsers/update", async ({ clientId, userId, payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.userDetail(clientId, userId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to update user.");
    }
    return body?.data as ClientUser;
  } catch (error) {
    return rejectWithValue("Unable to update user.");
  }
});

export const updateClientUserRoles = createAsyncThunk<
  void,
  { clientId: string; userId: number; roleIds: number[] },
  { rejectValue: string }
>("clientUsers/updateRoles", async ({ clientId, userId, roleIds }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.userRoles(clientId, userId), {
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

export const deleteClientUser = createAsyncThunk<
  number,
  { clientId: string; userId: number },
  { rejectValue: string }
>("clientUsers/delete", async ({ clientId, userId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.userDetail(clientId, userId), {
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

const clientUsersSlice = createSlice({
  name: "clientUsers",
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
    openAddModal(state) {
      state.modalMode = "add";
      state.editUserId = null;
    },
    openEditModal(state, action: PayloadAction<number>) {
      state.modalMode = "edit";
      state.editUserId = action.payload;
    },
    closeModal(state) {
      state.modalMode = null;
      state.editUserId = null;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClientRoles.pending, (state) => {
        state.error = "";
      })
      .addCase(fetchClientRoles.fulfilled, (state, action) => {
        state.roles = action.payload;
      })
      .addCase(fetchClientRoles.rejected, (state, action) => {
        state.error = action.payload || "Unable to load user groups.";
      })
      .addCase(fetchClientUsers.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchClientUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload.items;
        state.count = action.payload.count;
      })
      .addCase(fetchClientUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.items = [];
        state.count = 0;
        state.error = action.payload || "Unable to load users.";
      })
      .addCase(createClientUser.pending, (state) => {
        state.error = "";
      })
      .addCase(createClientUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to create user.";
      })
      .addCase(updateClientUser.pending, (state) => {
        state.error = "";
      })
      .addCase(updateClientUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to update user.";
      })
      .addCase(updateClientUserRoles.rejected, (state, action) => {
        state.error = action.payload || "Unable to update user roles.";
      })
      .addCase(deleteClientUser.fulfilled, (state, action) => {
        state.items = state.items.filter((user) => user.id !== action.payload);
        state.count = Math.max(0, state.count - 1);
      })
      .addCase(deleteClientUser.rejected, (state, action) => {
        state.error = action.payload || "Unable to delete user.";
      });
  },
});

export const {
  setPage,
  setQuery,
  setStatusFilter,
  openAddModal,
  openEditModal,
  closeModal,
  resetState,
} = clientUsersSlice.actions;
export default clientUsersSlice.reducer;
