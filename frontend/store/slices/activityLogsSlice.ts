import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";

type ActivityLogEntry = {
  id: number;
  tenant?: { id: number; name: string; slug?: string };
  actor?: { email?: string };
  module: string;
  action: string;
  description?: string;
  metadata?: {
    changes?: Record<string, { from?: unknown; to?: unknown }>;
  };
  created_at: string;
};

type ActivityLogsState = {
  logs: ActivityLogEntry[];
  page: number;
  count: number;
  isLoading: boolean;
  moduleFilter: string;
  actorFilter: string;
  startDate: string;
  endDate: string;
};

const initialState: ActivityLogsState = {
  logs: [],
  page: 1,
  count: 0,
  isLoading: false,
  moduleFilter: "all",
  actorFilter: "",
  startDate: "",
  endDate: "",
};

export const fetchActivityLogs = createAsyncThunk<
  { logs: ActivityLogEntry[]; count: number },
  { queryString: string },
  { rejectValue: string }
>("activityLogs/fetch", async ({ queryString }, { rejectWithValue }) => {
  try {
    const response = await apiFetch(API_PATHS.activityLogs(queryString));
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue("Unable to load activity logs.");
    }
    const items = Array.isArray(payload?.data?.items)
      ? (payload.data.items as ActivityLogEntry[])
      : Array.isArray(payload?.data)
        ? (payload.data as ActivityLogEntry[])
        : [];
    const count =
      typeof payload?.data?.count === "number" ? payload.data.count : items.length;
    return { logs: items, count };
  } catch (error) {
    return rejectWithValue("Unable to load activity logs.");
  }
});

const activityLogsSlice = createSlice({
  name: "activityLogs",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setModuleFilter(state, action: PayloadAction<string>) {
      state.moduleFilter = action.payload;
    },
    setActorFilter(state, action: PayloadAction<string>) {
      state.actorFilter = action.payload;
    },
    setStartDate(state, action: PayloadAction<string>) {
      state.startDate = action.payload;
    },
    setEndDate(state, action: PayloadAction<string>) {
      state.endDate = action.payload;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchActivityLogs.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchActivityLogs.fulfilled, (state, action) => {
        state.isLoading = false;
        state.logs = action.payload.logs;
        state.count = action.payload.count;
      })
      .addCase(fetchActivityLogs.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export const {
  setPage,
  setModuleFilter,
  setActorFilter,
  setStartDate,
  setEndDate,
  resetState,
} = activityLogsSlice.actions;
export default activityLogsSlice.reducer;
