import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import LocalCounterCache from "@/app/utils/localCounterCache";

interface CounterState {
  value: number;
}

// Initialize to 0 - will be loaded per task
const getInitialValue = (): number => {
  // Don't load from cache here - we need the taskId
  console.log('[CounterSlice] Initializing counter to 0 (will load per task)');
  return 0;
};

const initialState: CounterState = {
  value: getInitialValue(),
};

const counterSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    },
    setValue: (state, action: PayloadAction<number>) => {
      state.value = action.payload;
    },
    reset: (state) => {
      state.value = 0;
    },
    clearForAuth: (state) => {
      // Reset counter to 0 when user signs in (will be populated from DB)
      state.value = 0;
      // Clear the cache as well
      if (typeof window !== 'undefined') {
        LocalCounterCache.clearAllCounters();
      }
    },
  },
});

export const { increment, decrement, setValue, reset, clearForAuth } = counterSlice.actions;
export default counterSlice.reducer;