import { configureStore } from "@reduxjs/toolkit";
import userReducer from "../Feature/Userslice";
import languageReducer from "../Feature/Languageslice";
export const store = configureStore({
  reducer: {
    user: userReducer,
    language: languageReducer,
  },
});