import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type ForgotPasswordState = {
  email: string;
  error: string;
  success: string;
  isSubmitting: boolean;
};

const initialState: ForgotPasswordState = {
  email: "",
  error: "",
  success: "",
  isSubmitting: false,
};

export const submitForgotPassword = createAsyncThunk<
  string,
  { email: string },
  { rejectValue: string }
>("forgotPassword/submit", async ({ email }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.forgotPassword,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Request failed");
    }
    return "If the email exists, a reset link has been sent.";
  } catch (error) {
    return rejectWithValue("Unable to reach the authentication service.");
  }
});

const forgotPasswordSlice = createSlice({
  name: "forgotPassword",
  initialState,
  reducers: {
    setEmail(state, action: PayloadAction<string>) {
      state.email = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitForgotPassword.pending, (state) => {
        state.isSubmitting = true;
        state.error = "";
        state.success = "";
      })
      .addCase(submitForgotPassword.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.success = action.payload;
      })
      .addCase(submitForgotPassword.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Request failed";
      });
  },
});

export const { setEmail, resetState } = forgotPasswordSlice.actions;
export default forgotPasswordSlice.reducer;
