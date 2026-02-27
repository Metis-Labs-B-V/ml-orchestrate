import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";
import { authStorage, type AuthUser } from "../../lib/auth";
import { setImpersonator, setUser } from "./sessionSlice";

type UserProfile = {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  locale?: string;
  timezone?: string;
  mfa_enabled?: boolean;
  sso_enabled?: boolean;
  is_superuser?: boolean;
  tenants?: Array<{ name: string; roles?: Array<{ slug?: string; name?: string }> }>;
};

type ProfileForm = {
  first_name: string;
  last_name: string;
  phone: string;
  avatar_url: string;
  locale: string;
  timezone: string;
};

type MfaSetup = {
  secret: string;
  otpauth_url: string;
};

type SettingsState = {
  profile: UserProfile | null;
  settings: { mfa: boolean; sso: boolean };
  error: string;
  profileForm: ProfileForm;
  profileStatus: string;
  isLoading: boolean;
  mfaSetup: MfaSetup | null;
  mfaCode: string;
  mfaStatus: string;
};

const initialState: SettingsState = {
  profile: null,
  settings: { mfa: false, sso: false },
  error: "",
  profileForm: {
    first_name: "",
    last_name: "",
    phone: "",
    avatar_url: "",
    locale: "",
    timezone: "",
  },
  profileStatus: "",
  isLoading: false,
  mfaSetup: null,
  mfaCode: "",
  mfaStatus: "",
};

export const fetchProfile = createAsyncThunk<
  UserProfile,
  void,
  { rejectValue: string }
>("settings/fetchProfile", async (_, { rejectWithValue }) => {
  try {
    const user = authStorage.getUser();
    if (!user) {
      return rejectWithValue("Unable to load settings.");
    }
    return user as UserProfile;
  } catch (error) {
    return rejectWithValue("Unable to load settings.");
  }
});

export const updateSetting = createAsyncThunk<
  { key: "mfa" | "sso"; enabled: boolean },
  { key: "mfa" | "sso"; enabled: boolean },
  { rejectValue: string }
>("settings/updateSetting", async ({ key, enabled }, { rejectWithValue }) => {
  try {
    const endpoint = key === "mfa" ? API_PATHS.auth.mfaToggle : API_PATHS.auth.ssoToggle;
    await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
    return { key, enabled };
  } catch (error) {
    return rejectWithValue("Unable to update setting.");
  }
});

export const startMfaSetup = createAsyncThunk<
  MfaSetup,
  void,
  { rejectValue: string }
>("settings/startMfaSetup", async (_, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.mfaSetup, { method: "POST" });
    if (!response.ok) {
      return rejectWithValue("Unable to start MFA setup.");
    }
    const payload = await response.json();
    if (payload?.data?.secret) {
      return payload.data as MfaSetup;
    }
    return rejectWithValue("Unable to start MFA setup.");
  } catch (error) {
    return rejectWithValue("Unable to start MFA setup.");
  }
});

export const confirmMfa = createAsyncThunk<
  boolean,
  { code: string },
  { rejectValue: string }
>("settings/confirmMfa", async ({ code }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.mfaConfirm, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      return rejectWithValue("Invalid code.");
    }
    const payload = await response.json();
    return Boolean(payload?.data?.mfa_enabled);
  } catch (error) {
    return rejectWithValue("Invalid code.");
  }
});

export const disableMfa = createAsyncThunk<
  void,
  { code: string },
  { rejectValue: string }
>("settings/disableMfa", async ({ code }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.mfaDisable, {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      return rejectWithValue("Invalid code.");
    }
    return;
  } catch (error) {
    return rejectWithValue("Invalid code.");
  }
});

export const updateProfile = createAsyncThunk<
  UserProfile,
  { form: ProfileForm },
  { rejectValue: string }
>("settings/updateProfile", async ({ form }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(API_PATHS.auth.me, {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      return rejectWithValue("Unable to update profile.");
    }
    const payload = await response.json();
    if (payload?.data) {
      authStorage.save(
        {
          access: authStorage.getAccess() || "",
          refresh: authStorage.getRefresh() || "",
        },
        payload.data,
        authStorage.getImpersonator()
      );
      dispatch(setUser(payload.data as AuthUser));
      dispatch(setImpersonator(authStorage.getImpersonator()));
    }
    return payload?.data as UserProfile;
  } catch (error) {
    return rejectWithValue("Unable to update profile.");
  }
});

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateProfileField(
      state,
      action: PayloadAction<{ field: keyof ProfileForm; value: string }>
    ) {
      state.profileForm[action.payload.field] = action.payload.value;
    },
    setMfaCode(state, action: PayloadAction<string>) {
      state.mfaCode = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.profile = action.payload;
        state.settings = {
          mfa: Boolean(action.payload?.mfa_enabled),
          sso: Boolean(action.payload?.sso_enabled),
        };
        state.profileForm = {
          first_name: action.payload?.first_name || "",
          last_name: action.payload?.last_name || "",
          phone: action.payload?.phone || "",
          avatar_url: action.payload?.avatar_url || "",
          locale: action.payload?.locale || "",
          timezone: action.payload?.timezone || "",
        };
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "Unable to load settings.";
      })
      .addCase(updateSetting.fulfilled, (state, action) => {
        state.settings[action.payload.key] = action.payload.enabled;
      })
      .addCase(startMfaSetup.fulfilled, (state, action) => {
        state.mfaSetup = action.payload;
        state.mfaStatus = "";
      })
      .addCase(startMfaSetup.rejected, (state, action) => {
        state.mfaStatus = action.payload || "Unable to start MFA setup.";
      })
      .addCase(confirmMfa.fulfilled, (state, action) => {
        state.settings.mfa = action.payload;
        state.mfaStatus = "MFA enabled.";
      })
      .addCase(confirmMfa.rejected, (state, action) => {
        state.mfaStatus = action.payload || "Invalid code.";
      })
      .addCase(disableMfa.fulfilled, (state) => {
        state.settings.mfa = false;
        state.mfaSetup = null;
        state.mfaStatus = "MFA disabled.";
      })
      .addCase(disableMfa.rejected, (state, action) => {
        state.mfaStatus = action.payload || "Invalid code.";
      })
      .addCase(updateProfile.pending, (state) => {
        state.profileStatus = "";
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.profile = action.payload;
        state.profileStatus = "Profile updated.";
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.profileStatus = "Unable to update profile.";
        state.error = action.payload || "Unable to update profile.";
      });
  },
});

export const { updateProfileField, setMfaCode, resetState } = settingsSlice.actions;
export default settingsSlice.reducer;
