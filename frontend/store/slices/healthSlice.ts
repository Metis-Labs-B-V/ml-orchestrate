import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axiosClient from "../../lib/axiosClient";

type HealthPayload = {
  service1: string;
  service2: string;
  error: string;
};

type HealthState = HealthPayload & {
  isLoading: boolean;
};

const initialState: HealthState = {
  service1: "unknown",
  service2: "unknown",
  error: "",
  isLoading: false,
};

export const checkHealth = createAsyncThunk<HealthPayload>(
  "health/check",
  async () => {
    const service1Base = process.env.NEXT_PUBLIC_SERVICE1_BASE_URL;
    const service2Base = process.env.NEXT_PUBLIC_SERVICE2_BASE_URL;

    if (!service1Base || !service2Base) {
      return {
        service1: "unknown",
        service2: "unknown",
        error: "Base URLs are not configured.",
      };
    }

    const [service1Res, service2Res] = await Promise.allSettled([
      axiosClient.get(`${service1Base}/health/`),
      axiosClient.get(`${service2Base}/health/`),
    ]);

    const nextHealth: HealthPayload = {
      service1:
        service1Res.status === "fulfilled"
          ? service1Res.value.data.status || "ok"
          : "unreachable",
      service2:
        service2Res.status === "fulfilled"
          ? service2Res.value.data.status || "ok"
          : "unreachable",
      error: "",
    };

    const errors: string[] = [];
    if (service1Res.status === "rejected") {
      errors.push(`Service 1: ${service1Res.reason?.message || "unreachable"}`);
    }
    if (service2Res.status === "rejected") {
      errors.push(`Service 2: ${service2Res.reason?.message || "unreachable"}`);
    }
    nextHealth.error = errors.join(" | ");

    return nextHealth;
  }
);

const healthSlice = createSlice({
  name: "health",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(checkHealth.pending, (state) => {
        state.isLoading = true;
        state.error = "";
      })
      .addCase(checkHealth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.service1 = action.payload.service1;
        state.service2 = action.payload.service2;
        state.error = action.payload.error;
      })
      .addCase(checkHealth.rejected, (state) => {
        state.isLoading = false;
        state.service1 = "unknown";
        state.service2 = "unknown";
        state.error = "Unable to check health.";
      });
  },
});

export default healthSlice.reducer;
