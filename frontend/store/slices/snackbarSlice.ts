import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type SnackbarState = {
  message: string;
  type: "success" | "error" | null;
};

const initialState: SnackbarState = {
  message: "",
  type: null,
};

const snackbarSlice = createSlice({
  name: "snackbar",
  initialState,
  reducers: {
    showSuccess(state, action: PayloadAction<string>) {
      state.message = action.payload;
      state.type = "success";
    },
    showError(state, action: PayloadAction<string>) {
      state.message = action.payload;
      state.type = "error";
    },
    clearSnackbar(state) {
      state.message = "";
      state.type = null;
    },
  },
});

export const { showSuccess, showError, clearSnackbar } = snackbarSlice.actions;
export default snackbarSlice.reducer;

