import { createSlice } from "@reduxjs/toolkit";

export const languageslice = createSlice({
  name: "language",
  initialState: {
    current: "en",
  },
  reducers: {
    setLanguage: (state, action) => {
      state.current = action.payload;
    },
  },
});

export const { setLanguage } = languageslice.actions;
export const selectLanguage = (state) => state.language.current;
export default languageslice.reducer;