import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type TenantsNewState = {
  tenantName: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPassword: string;
  tenantId: string;
  userEmail: string;
  userPassword: string;
  status: string;
  error: string;
  isSubmitting: boolean;
};

const initialState: TenantsNewState = {
  tenantName: "",
  ownerEmail: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerPassword: "",
  tenantId: "",
  userEmail: "",
  userPassword: "",
  status: "",
  error: "",
  isSubmitting: false,
};

export const onboardTenant = createAsyncThunk<
  { tenantId?: string; message: string },
  {
    tenantName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    ownerLastName: string;
  },
  { rejectValue: string }
>("tenantsNew/onboard", async (payload, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.onboard, {
      method: "POST",
      body: JSON.stringify({
        tenant: { name: payload.tenantName },
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
      return rejectWithValue(body?.message || "Unable to onboard tenant.");
    }
    return {
      tenantId: body?.data?.tenant?.id ? String(body.data.tenant.id) : undefined,
      message: "Tenant onboarded.",
    };
  } catch (error) {
    return rejectWithValue("Unable to onboard tenant.");
  }
});

export const addTenantUser = createAsyncThunk<
  string,
  { tenantId: string; userEmail: string; userPassword: string },
  { rejectValue: string }
>("tenantsNew/addUser", async ({ tenantId, userEmail, userPassword }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.tenants.users(tenantId), {
      method: "POST",
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      return rejectWithValue(body?.message || "Unable to add user.");
    }
    return "User added.";
  } catch (error) {
    return rejectWithValue("Unable to add user.");
  }
});

const tenantsNewSlice = createSlice({
  name: "tenantsNew",
  initialState,
  reducers: {
    updateField(
      state,
      action: PayloadAction<{ field: keyof TenantsNewState; value: string }>
    ) {
      state[action.payload.field] = action.payload.value as never;
    },
    resetStatus(state) {
      state.status = "";
      state.error = "";
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(onboardTenant.pending, (state) => {
        state.isSubmitting = true;
        state.status = "";
        state.error = "";
      })
      .addCase(onboardTenant.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.status = action.payload.message;
        if (action.payload.tenantId) {
          state.tenantId = action.payload.tenantId;
        }
      })
      .addCase(onboardTenant.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Unable to onboard tenant.";
      })
      .addCase(addTenantUser.pending, (state) => {
        state.isSubmitting = true;
        state.status = "";
        state.error = "";
      })
      .addCase(addTenantUser.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.status = action.payload;
      })
      .addCase(addTenantUser.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Unable to add user.";
      });
  },
});

export const { updateField, resetStatus, resetState } = tenantsNewSlice.actions;
export default tenantsNewSlice.reducer;
