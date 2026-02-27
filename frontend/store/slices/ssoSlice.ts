import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";
import { authStorage, type AuthUser } from "../../lib/auth";
import { setImpersonator, setUser } from "./sessionSlice";

type SsoState = {
  error: string;
  isLoading: boolean;
};

const initialState: SsoState = {
  error: "",
  isLoading: false,
};

export const exchangeSsoToken = createAsyncThunk<
  any,
  { token: string },
  { rejectValue: string }
>("sso/exchange", async ({ token }, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.ssoExchange,
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
      { auth: false }
    );
    const payload = await response.json();
    const data = payload?.data;
    if (!response.ok || !data?.access || !data?.refresh || !data?.user) {
      return rejectWithValue(payload?.message || "SSO login failed.");
    }
    authStorage.save({ access: data.access, refresh: data.refresh }, data.user);
    dispatch(setUser(data.user as AuthUser));
    dispatch(setImpersonator(null));
    return payload;
  } catch (error) {
    return rejectWithValue("SSO login failed.");
  }
});

const ssoSlice = createSlice({
  name: "sso",
  initialState,
  reducers: {
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(exchangeSsoToken.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(exchangeSsoToken.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(exchangeSsoToken.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || "SSO login failed.";
      });
  },
});

export const { resetState, setError } = ssoSlice.actions;
export default ssoSlice.reducer;
