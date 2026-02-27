import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type ResetPasswordState = {
  token: string;
  password: string;
  error: string;
  success: string;
  isSubmitting: boolean;
};

const initialState: ResetPasswordState = {
  token: "",
  password: "",
  error: "",
  success: "",
  isSubmitting: false,
};

export const submitResetPassword = createAsyncThunk<
  string,
  { token: string; password: string },
  { rejectValue: string }
>("resetPassword/submit", async ({ token, password }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.resetPassword,
      {
        method: "POST",
        body: JSON.stringify({ token, password }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Reset failed");
    }
    return "Password updated. You can sign in now.";
  } catch (error) {
    return rejectWithValue("Unable to reach the authentication service.");
  }
});

const resetPasswordSlice = createSlice({
  name: "resetPassword",
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    setPassword(state, action: PayloadAction<string>) {
      state.password = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitResetPassword.pending, (state) => {
        state.isSubmitting = true;
        state.error = "";
        state.success = "";
      })
      .addCase(submitResetPassword.fulfilled, (state, action) => {
        state.isSubmitting = false;
        state.success = action.payload;
      })
      .addCase(submitResetPassword.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Reset failed";
      });
  },
});

export const { setToken, setPassword, resetState } = resetPasswordSlice.actions;
export default resetPasswordSlice.reducer;
