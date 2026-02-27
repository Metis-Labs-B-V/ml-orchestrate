import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type I18nState = {
  language: string;
};

const initialState: I18nState = {
  language: "en",
};

const i18nSlice = createSlice({
  name: "i18n",
  initialState,
  reducers: {
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
    },
  },
});

export const { setLanguage } = i18nSlice.actions;
export default i18nSlice.reducer;
