import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";
import { authStorage, type AuthUser } from "../../lib/auth";
import { setImpersonator, setUser } from "./sessionSlice";

type VerifyStatus = "loading" | "success" | "invalid" | "expired";

type VerifyEmailState = {
  status: VerifyStatus;
  message: string;
  email: string;
  resendLoading: boolean;
  resendSuccess: boolean;
};

const initialState: VerifyEmailState = {
  status: "loading",
  message: "",
  email: "",
  resendLoading: false,
  resendSuccess: false,
};

export const verifyEmail = createAsyncThunk<
  { message: string; shouldRedirect: boolean },
  { token: string },
  { rejectValue: { status: VerifyStatus; message: string; email?: string } }
>("verifyEmail/verify", async ({ token }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.tenant.verifyEmail,
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      const tokenError = payload?.errors?.token?.[0];
      if (tokenError === "Invalid link") {
        return rejectWithValue({ status: "invalid", message: "Invalid link" });
      }
      if (tokenError === "Expired token") {
        return rejectWithValue({
          status: "expired",
          message: "Link is expired",
          email: payload?.errors?.email || payload?.email || "",
        });
      }
      return rejectWithValue({ status: "invalid", message: "Verification failed." });
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save({ access: data.access, refresh: data.refresh }, data.user);
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator(null));
      return { message: "", shouldRedirect: true };
    }
    return {
      message: payload?.message || "Email verified successfully.",
      shouldRedirect: false,
    };
  } catch (error) {
    return rejectWithValue({ status: "invalid", message: "Verification failed." });
  }
});

export const resendVerification = createAsyncThunk<
  void,
  { email: string },
  { rejectValue: string }
>("verifyEmail/resend", async ({ email }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(
      API_PATHS.tenant.sendEmailVerificationLink,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      { auth: false }
    );
    if (!response.ok) {
      return rejectWithValue("Unable to resend link.");
    }
    return;
  } catch (error) {
    return rejectWithValue("Unable to resend link.");
  }
});

const verifyEmailSlice = createSlice({
  name: "verifyEmail",
  initialState,
  reducers: {
    resetState() {
      return initialState;
    },
    setStatus(state, action: PayloadAction<VerifyStatus>) {
      state.status = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(verifyEmail.pending, (state) => {
        state.status = "loading";
        state.message = "";
        state.email = "";
      })
      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.status = "success";
        state.message = action.payload.message;
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.status = action.payload?.status || "invalid";
        state.message = action.payload?.message || "Verification failed.";
        state.email = action.payload?.email || "";
      })
      .addCase(resendVerification.pending, (state) => {
        state.resendLoading = true;
        state.resendSuccess = false;
      })
      .addCase(resendVerification.fulfilled, (state) => {
        state.resendLoading = false;
        state.resendSuccess = true;
      })
      .addCase(resendVerification.rejected, (state) => {
        state.resendLoading = false;
        state.resendSuccess = false;
      });
  },
});

export const { resetState, setStatus } = verifyEmailSlice.actions;
export default verifyEmailSlice.reducer;
