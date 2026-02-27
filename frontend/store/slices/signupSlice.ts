import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { apiFetch } from "../../lib/api";
import { API_PATHS } from "../../lib/apiPaths";
import { authStorage, type AuthUser } from "../../lib/auth";
import { setImpersonator, setUser } from "./sessionSlice";

type SignupForm = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

type SignupState = {
  form: SignupForm;
  error: string;
  success: string;
  isSubmitting: boolean;
};

const initialState: SignupState = {
  form: {
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  },
  error: "",
  success: "",
  isSubmitting: false,
};

export const signupUser = createAsyncThunk<
  any,
  SignupForm,
  { rejectValue: string }
>("signup/signupUser", async (form, { rejectWithValue, dispatch }) => {
  try {
    const response = await apiFetch(
      API_PATHS.auth.signup,
      {
        method: "POST",
        body: JSON.stringify(form),
      },
      { auth: false }
    );
    const payload = await response.json();
    if (!response.ok) {
      return rejectWithValue(payload?.message || "Signup failed");
    }
    const data = payload?.data;
    if (data?.access && data?.refresh && data?.user) {
      authStorage.save({ access: data.access, refresh: data.refresh }, data.user);
      dispatch(setUser(data.user as AuthUser));
      dispatch(setImpersonator(null));
    }
    return payload;
  } catch (error) {
    return rejectWithValue("Unable to reach the authentication service.");
  }
});

const signupSlice = createSlice({
  name: "signup",
  initialState,
  reducers: {
    updateField(
      state,
      action: PayloadAction<{ field: keyof SignupForm; value: string }>
    ) {
      state.form[action.payload.field] = action.payload.value;
    },
    resetState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signupUser.pending, (state) => {
        state.isSubmitting = true;
        state.error = "";
        state.success = "";
      })
      .addCase(signupUser.fulfilled, (state) => {
        state.isSubmitting = false;
        state.success = "Account created successfully.";
      })
      .addCase(signupUser.rejected, (state, action) => {
        state.isSubmitting = false;
        state.error = action.payload || "Signup failed";
      });
  },
});

export const { updateField, resetState } = signupSlice.actions;
export default signupSlice.reducer;
