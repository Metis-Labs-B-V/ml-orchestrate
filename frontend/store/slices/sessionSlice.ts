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
  return {
    user: authStorage.getUser(),
    impersonator: authStorage.getImpersonator(),
  };
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
      state.ready = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateSession.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.impersonator = action.payload.impersonator;
        state.ready = true;
      })
      .addCase(logoutSession.fulfilled, (state) => {
        state.user = null;
        state.impersonator = null;
        state.ready = false;
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
        state.ready = false;
      });
  },
});

export const { setUser, setImpersonator, setReady, clearSession } =
  sessionSlice.actions;

export default sessionSlice.reducer;
