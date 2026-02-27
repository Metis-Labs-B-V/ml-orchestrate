import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type LogEntry = {
  id: number;
  impersonator: { email: string };
  target_user: { email: string };
  ip_address?: string;
  user_agent?: string;
  created_at: string;
};

type ImpersonationLogsState = {
  logs: LogEntry[];
  page: number;
  count: number;
  isLoading: boolean;
};

const initialState: ImpersonationLogsState = {
  logs: [],
  page: 1,
  count: 0,
  isLoading: false,
};

export const fetchImpersonationLogs = createAsyncThunk<
  { logs: LogEntry[]; count: number },
  { page: number },
  { rejectValue: string }
>("impersonationLogs/fetch", async ({ page }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.impersonationLogs(`page=${page}`));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue("Unable to load logs.");
    }
    const items = payload?.data?.items || [];
    const count = payload?.data?.count || 0;
    return { logs: items, count };
  } catch (error) {
    return rejectWithValue("Unable to load logs.");
  }
});

const impersonationLogsSlice = createSlice({
  name: "impersonationLogs",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchImpersonationLogs.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchImpersonationLogs.fulfilled, (state, action) => {
        state.isLoading = false;
        state.logs = action.payload.logs;
        state.count = action.payload.count;
      })
      .addCase(fetchImpersonationLogs.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export const { setPage, resetState } = impersonationLogsSlice.actions;
export default impersonationLogsSlice.reducer;
