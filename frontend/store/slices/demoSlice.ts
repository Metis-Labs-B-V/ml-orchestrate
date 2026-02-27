import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type DemoState = {
  message: string;
  count: number;
};

const initialState: DemoState = {
  message: "Redux is ready",
  count: 1,
};

const demoSlice = createSlice({
  name: "demo",
  initialState,
  reducers: {
    setMessage(state, action: PayloadAction<string>) {
      state.message = action.payload;
    },
    increment(state) {
      state.count += 1;
    },
  },
});

export const { setMessage, increment } = demoSlice.actions;
export default demoSlice.reducer;
