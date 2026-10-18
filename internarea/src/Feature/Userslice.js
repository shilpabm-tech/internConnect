import { createSlice } from "@reduxjs/toolkit";

export const userslice = createSlice({
  name: "user",
  initialState: {
    value: null,
    mongoUser: null,
  },
  reducers: {
    login: (state, action) => {
      state.user = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.mongoUser = null;
    },
    setMongoUser: (state, action) => {
      state.mongoUser = action.payload;
    },
  },
});
export const { login, logout, setMongoUser } = userslice.actions;
export const selectuser = (state) => state.user.user;
export const selectMongoUser = (state) => state.user.mongoUser;
export default userslice.reducer;