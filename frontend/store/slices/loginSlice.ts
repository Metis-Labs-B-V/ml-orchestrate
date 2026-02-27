import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";
import { authStorage, type AuthUser } from "../../lib/auth";
import { setImpersonator, setUser } from "./sessionSlice";

type ImpersonationUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
};

type LoginState = {
  email: string;
  password: string;
  remember: boolean;
  error: string;
  success: string;
  isSubmitting: boolean;
  isSuperUser: boolean;
  users: ImpersonationUser[];
  selectedUserId: string;
  impersonationError: string;
  mfaToken: string;
  mfaCode: string;
  mfaError: string;
  otpRequired: boolean;
  otp: string;
  otpError: string;
  otpPending: { email: string; password: string } | null;
};

const initialState: LoginState = {
  email: "",
  password: "",
  remember: false,
  error: "",
  success: "",
  isSubmitting: false,
  isSuperUser: false,
  users: [],
  selectedUserId: "",
  impersonationError: "",
  mfaToken: "",
  mfaCode: "",
  mfaError: "",
  otpRequired: false,
  otp: "",
  otpError: "",
  otpPending: null,
};

export const loginUser = createAsyncThunk<
  { payload: any; email: string; password: string },
  { email: string; password: string; remember: boolean },
  { rejectValue: string }
>("login/loginUser", async ({ email, password, remember }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.login,
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Login failed");
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save(
        { access: data.access, refresh: data.refresh },
        data.user,
        data.impersonator,
        remember
      );
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator((data.impersonator as AuthUser) || null));
    }
    return { payload, email, password };
  } catch (error) {
    return rejectWithValue("Unable to reach the authentication service.");
  }
});

export const verifyMfa = createAsyncThunk<
  any,
  { mfaToken: string; code: string; remember: boolean },
  { rejectValue: string }
>("login/verifyMfa", async ({ mfaToken, code, remember }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.mfaVerifyLogin,
      {
        method: "POST",
        body: JSON.stringify({ mfa_token: mfaToken, code }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Invalid code");
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save(
        { access: data.access, refresh: data.refresh },
        data.user,
        data.impersonator,
        remember
      );
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator((data.impersonator as AuthUser) || null));
    }
    return payload;
  } catch (error) {
    return rejectWithValue("Unable to verify code.");
  }
});

export const verifyOtp = createAsyncThunk<
  any,
  { email: string; password: string; otp: string; remember: boolean },
  { rejectValue: string }
>("login/verifyOtp", async ({ email, password, otp, remember }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.verifyLoginOtp,
      {
        method: "POST",
        body: JSON.stringify({ email, password, otp }),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.errors?.otp?.[0] || payload?.message || "Invalid code");
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save(
        { access: data.access, refresh: data.refresh },
        data.user,
        data.impersonator,
        remember
      );
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator((data.impersonator as AuthUser) || null));
    }
    return payload;
  } catch (error) {
    return rejectWithValue("Unable to verify code.");
  }
});

export const fetchImpersonationUsers = createAsyncThunk<
  ImpersonationUser[],
  void,
  { rejectValue: string }
>("login/fetchImpersonationUsers", async (_, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.impersonationUsers);
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to load users.");
    }
    return payload?.data || [];
  } catch (error) {
    return rejectWithValue("Unable to load users.");
  }
});

export const startSso = createAsyncThunk<
  string | null,
  { provider: "google" | "microsoft" },
  { rejectValue: string }
>("login/startSso", async ({ provider }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.ssoStart(provider), {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Unable to start SSO.");
    }
    return payload?.data?.url || null;
  } catch (error) {
    return rejectWithValue("Unable to start SSO.");
  }
});

export const impersonateUser = createAsyncThunk<
  any,
  { userId: number },
  { rejectValue: string }
>("login/impersonateUser", async ({ userId }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.impersonate, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Impersonation failed");
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save(
        { access: data.access, refresh: data.refresh },
        data.user,
        data.impersonator
      );
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator((data.impersonator as AuthUser) || null));
    }
    return payload;
  } catch (error) {
    return rejectWithValue("Unable to reach the authentication service.");
  }
});

const loginSlice = createSlice({
  name: "login",
  initialState,
  reducers: {
    updateField(
      state,
      action: PayloadAction<{ field: keyof LoginState; value: LoginState[keyof LoginState] }>
    ) {
      state[action.payload.field] = action.payload.value as never;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.isSubmitting = true;
        state.error = "";
        state.success = "";
        state.otpError = "";
        state.mfaError = "";
        state.impersonationError = "";
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isSubmitting = false;
        const data = action.payload.payload?.data;
        if (data?.mfa_required) {
          state.mfaToken = data.mfa_token;
          state.success = "Enter the code from your authenticator app.";
          return;
        }
        if (data?.otp_required) {
          state.otpRequired = true;
          state.otpPending = { email: action.payload.email, password: action.payload.password };
          state.success = "Enter the 6-digit code sent to your email.";
          return;
        }
        if (data?.access && data?.refresh) {
          state.success = "Signed in successfully.";
          state.isSuperUser = Boolean(data?.user?.is_superuser);
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Login failed";
      })
      .addCase(verifyMfa.pending, (state) => {
        state.mfaError = "";
      })
      .addCase(verifyMfa.fulfilled, (state) => {
        state.success = "Signed in successfully.";
        state.mfaToken = "";
        state.mfaCode = "";
        state.mfaError = "";
      })
      .addCase(verifyMfa.rejected, (state, action) => {
        state.mfaError = action.payload || "Invalid code";
      })
      .addCase(verifyOtp.pending, (state) => {
        state.otpError = "";
      })
      .addCase(verifyOtp.fulfilled, (state) => {
        state.success = "Signed in successfully.";
        state.otpRequired = false;
        state.otpPending = null;
        state.otp = "";
        state.otpError = "";
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        const message = action.payload || "Invalid code";
        state.otpError = message;
        state.error = message;
        if (message.includes("Too many incorrect attempts")) {
          state.otpRequired = false;
          state.otpPending = null;
        }
      })
      .addCase(fetchImpersonationUsers.fulfilled, (state, action) => {
        state.users = action.payload;
      })
      .addCase(fetchImpersonationUsers.rejected, (state, action) => {
        state.impersonationError = action.payload || "Unable to load users.";
      })
      .addCase(startSso.rejected, (state, action) => {
        state.error = action.payload || "Unable to start SSO.";
      })
      .addCase(impersonateUser.rejected, (state, action) => {
        state.impersonationError = action.payload || "Impersonation failed";
      })
      .addCase(impersonateUser.fulfilled, (state, action) => {
        const data = action.payload?.data;
        if (data?.access && data?.refresh) {
          state.success = `Now acting as ${data?.user?.email || "user"}.`;
        }
      });
  },
});

export const { updateField, resetState } = loginSlice.actions;
export default loginSlice.reducer;
