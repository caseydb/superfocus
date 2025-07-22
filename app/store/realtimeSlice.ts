import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface RealtimeState {
  isActive: boolean;
}

const initialState: RealtimeState = {
  isActive: false,
};

const realtimeSlice = createSlice({
  name: "realtime",
  initialState,
  reducers: {
    setIsActive: (state, action: PayloadAction<boolean>) => {
      state.isActive = action.payload;
    },
    toggleIsActive: (state) => {
      state.isActive = !state.isActive;
    },
  },
});

export const { setIsActive, toggleIsActive } = realtimeSlice.actions;

export default realtimeSlice.reducer;
