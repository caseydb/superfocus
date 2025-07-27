import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface TimerState {
  seconds: number;
  isRunning: boolean;
  isPaused: boolean;
  // For Pomodoro mode
  selectedMinutes: number;
  totalSeconds: number;
  remainingSeconds: number;
}

const initialState: TimerState = {
  seconds: 0,
  isRunning: false,
  isPaused: false,
  selectedMinutes: 25,
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
};

const timerSlice = createSlice({
  name: "timer",
  initialState,
  reducers: {
    setSeconds: (state, action: PayloadAction<number>) => {
      state.seconds = action.payload;
    },
    incrementSeconds: (state) => {
      state.seconds += 1;
    },
    setIsRunning: (state, action: PayloadAction<boolean>) => {
      state.isRunning = action.payload;
    },
    setIsPaused: (state, action: PayloadAction<boolean>) => {
      state.isPaused = action.payload;
    },
    setSelectedMinutes: (state, action: PayloadAction<number>) => {
      state.selectedMinutes = action.payload;
      if (!state.isRunning && !state.isPaused) {
        state.totalSeconds = action.payload * 60;
        state.remainingSeconds = action.payload * 60;
      }
    },
    setTotalSeconds: (state, action: PayloadAction<number>) => {
      state.totalSeconds = action.payload;
    },
    setRemainingSeconds: (state, action: PayloadAction<number>) => {
      state.remainingSeconds = action.payload;
    },
    decrementRemainingSeconds: (state) => {
      if (state.remainingSeconds > 0) {
        state.remainingSeconds -= 1;
      }
    },
    resetTimer: (state) => {
      state.seconds = 0;
      state.isRunning = false;
      state.isPaused = false;
      state.remainingSeconds = state.totalSeconds;
    },
    resetPomodoroTimer: (state) => {
      state.remainingSeconds = state.totalSeconds;
      state.seconds = 0;
    },
  },
});

export const {
  setSeconds,
  incrementSeconds,
  setIsRunning,
  setIsPaused,
  setSelectedMinutes,
  setTotalSeconds,
  setRemainingSeconds,
  decrementRemainingSeconds,
  resetTimer,
  resetPomodoroTimer,
} = timerSlice.actions;

export default timerSlice.reducer;