import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type CustomersNewState = {
  customerName: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPassword: string;
  status: string;
  error: string;
  isSubmitting: boolean;
};

const initialState: CustomersNewState = {
  customerName: "",
  ownerEmail: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerPassword: "",
  status: "",
  error: "",
  isSubmitting: false,
};

export const onboardCustomer = createAsyncThunk<
  string,
  {
    customerName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    ownerLastName: string;
    tenantId?: number | string | null;
  },
  { rejectValue: string }
>("customersNew/onboard", async (payload, { rejectWithValue }) => {
  try {
    const customerPayload: Record<string, unknown> = { name: payload.customerName };
    if (payload.tenantId) {
      customerPayload.tenant_id = payload.tenantId;
    }
    const response = await apiFetch(API_PATHS.auth.onboardCustomer, {
      method: "POST",
      body: JSON.stringify({
        customer: customerPayload,
        owner: {
          email: payload.ownerEmail,
          password: payload.ownerPassword,
          first_name: payload.ownerFirstName,
          last_name: payload.ownerLastName,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to onboard client.");
    }
    return "Client onboarded.";
  } catch (error) {
    return rejectWithValue("Unable to onboard client.");
  }
});

const customersNewSlice = createSlice({
  name: "customersNew",
  initialState,
  reducers: {
    updateField(
      state,
      action: PayloadAction<{ field: keyof CustomersNewState; value: string }>
    ) {
      state[action.payload.field] = action.payload.value as never;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(onboardCustomer.pending, (state) => {
        state.isSubmitting = true;
        state.status = "";
        state.error = "";
      })
      .addCase(onboardCustomer.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.status = action.payload;
      })
      .addCase(onboardCustomer.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Unable to onboard client.";
      });
  },
});

export const { updateField, resetState } = customersNewSlice.actions;
export default customersNewSlice.reducer;
