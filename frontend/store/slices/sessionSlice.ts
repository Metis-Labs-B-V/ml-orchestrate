import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { authStorage, type AuthUser } from "../../lib/auth";
import { logout as apiLogout, apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type SessionState = {
  user: AuthUser | null;
  impersonator: AuthUser | null;
  ready: boolean;
};

const initialState: SessionState = {
  user: null,
  impersonator: null,
  ready: false,
};

export const hydrateSession = createAsyncThunk("session/hydrate", async () => {
  if (typeof window === "undefined") {
    return { user: null, impersonator: null };
  }
  try {
    return {
      user: authStorage.getUser(),
      impersonator: authStorage.getImpersonator(),
    };
  } catch {
    authStorage.clear();
    return { user: null, impersonator: null };
  }
});

export const logoutSession = createAsyncThunk("session/logout", async () => {
  await apiLogout();
  return null;
});

export const validateSession = createAsyncThunk(
  "session/validate",
  async (_, { rejectWithValue }) => {
    try {
      const access = authStorage.getAccess();
      const user = authStorage.getUser();
      const impersonator = authStorage.getImpersonator();
      if (access && user) {
        return { user, impersonator };
      }
      authStorage.clear();
      return rejectWithValue("Unauthorized");
    } catch (error) {
      authStorage.clear();
      return rejectWithValue("Invalid session");
    }
  }
);

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    setImpersonator(state, action: PayloadAction<AuthUser | null>) {
      state.impersonator = action.payload;
    },
    setReady(state, action: PayloadAction<boolean>) {
      state.ready = action.payload;
    },
    clearSession(state) {
      state.user = null;
      state.impersonator = null;
      state.ready = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateSession.pending, (state) => {
        state.ready = false;
      })
      .addCase(hydrateSession.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.impersonator = action.payload.impersonator;
        state.ready = true;
      })
      .addCase(hydrateSession.rejected, (state) => {
        state.user = null;
        state.impersonator = null;
        state.ready = true;
      })
      .addCase(logoutSession.fulfilled, (state) => {
        state.user = null;
        state.impersonator = null;
        state.ready = true;
      })
      .addCase(validateSession.pending, (state) => {
        state.ready = false;
      })
      .addCase(validateSession.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.impersonator = action.payload.impersonator;
        state.ready = true;
      })
      .addCase(validateSession.rejected, (state) => {
        state.user = null;
        state.impersonator = null;
        state.ready = true;
      });
  },
});

export const { setUser, setImpersonator, setReady, clearSession } =
  sessionSlice.actions;

export default sessionSlice.reducer;
