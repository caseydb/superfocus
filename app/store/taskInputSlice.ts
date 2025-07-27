import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { checkForActiveTask } from "./taskSlice";

interface TaskInputState {
  currentInput: string;
  isLocked: boolean;
  hasStarted: boolean;
}

const initialState: TaskInputState = {
  currentInput: "",
  isLocked: false,
  hasStarted: false,
};

const taskInputSlice = createSlice({
  name: "taskInput",
  initialState,
  reducers: {
    setCurrentInput: (state, action: PayloadAction<string>) => {
      state.currentInput = action.payload;
    },
    lockInput: (state) => {
      state.isLocked = true;
    },
    unlockInput: (state) => {
      state.isLocked = false;
    },
    setHasStarted: (state, action: PayloadAction<boolean>) => {
      state.hasStarted = action.payload;
    },
    resetInput: (state) => {
      state.currentInput = "";
      state.isLocked = false;
      state.hasStarted = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(checkForActiveTask.fulfilled, (state, action) => {
      if (action.payload) {
        const { task } = action.payload as { task: { name: string } };
        // Restore input state when active task is found
        state.currentInput = task.name;
        state.isLocked = true; // Lock input since task is active
        state.hasStarted = true;
      }
    });
  },
});

export const { setCurrentInput, lockInput, unlockInput, setHasStarted, resetInput } = taskInputSlice.actions;

export default taskInputSlice.reducer;