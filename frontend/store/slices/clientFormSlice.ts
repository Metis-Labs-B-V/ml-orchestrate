import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

export type ClientPayload = {
  name: string;
  vat?: string;
  kvk?: string;
  phone?: string;
  email?: string;
  website?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip_code?: string;
  tenant_id?: number | string;
};

export type ClientRecord = ClientPayload & {
  id: number;
  status?: string;
  is_active?: boolean;
  tenant?: number;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown> | null;
};

type ClientFormState = {
  client: ClientRecord | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string;
};

const initialState: ClientFormState = {
  client: null,
  isLoading: false,
  isSaving: false,
  error: "",
};

export const fetchClient = createAsyncThunk<
  ClientRecord,
  { clientId: string | number },
  { rejectValue: string }
>("clientForm/fetch", async ({ clientId }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.detail(clientId));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load client.");
    }
    return payload?.data as ClientRecord;
  } catch (error) {
    return rejectWithValue("Unable to load client.");
  }
});

export const createClient = createAsyncThunk<
  ClientRecord,
  { payload: ClientPayload },
  { rejectValue: string }
>("clientForm/create", async ({ payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.list(), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to create client.");
    }
    return body?.data as ClientRecord;
  } catch (error) {
    return rejectWithValue("Unable to create client.");
  }
});

export const updateClient = createAsyncThunk<
  ClientRecord,
  { clientId: string | number; payload: ClientPayload },
  { rejectValue: string }
>("clientForm/update", async ({ clientId, payload }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.customers.detail(clientId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to update client.");
    }
    return body?.data as ClientRecord;
  } catch (error) {
    return rejectWithValue("Unable to update client.");
  }
});

const clientFormSlice = createSlice({
  name: "clientForm",
  initialState,
  reducers: {
    resetClientForm() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClient.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchClient.fulfilled, (state, action) => {
        state.isLoading = false;
        state.client = action.payload;
      })
      .addCase(fetchClient.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load client.";
        state.client = null;
      })
      .addCase(createClient.pending, (state) => {
        state.isSaving = true;
        state.error = "";
      })
      .addCase(createClient.fulfilled, (state, action) => {
        state.isSaving = false;
        state.client = action.payload;
      })
      .addCase(createClient.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload || "Unable to create client.";
      })
      .addCase(updateClient.pending, (state) => {
        state.isSaving = true;
        state.error = "";
      })
      .addCase(updateClient.fulfilled, (state, action) => {
        state.isSaving = false;
        state.client = action.payload;
      })
      .addCase(updateClient.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload || "Unable to update client.";
      });
  },
});

export const { resetClientForm } = clientFormSlice.actions;
export default clientFormSlice.reducer;
