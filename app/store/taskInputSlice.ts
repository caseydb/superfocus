import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { checkForActiveTask } from "./taskSlice";

interface TaskInputState {
  currentInput: string;
  currentTaskId: string | null;  // Add task ID tracking
  isLocked: boolean;
  hasStarted: boolean;
}

const initialState: TaskInputState = {
  currentInput: "",
  currentTaskId: null,
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
    setCurrentTask: (state, action: PayloadAction<{ id: string | null; name: string }>) => {
      state.currentTaskId = action.payload.id;
      state.currentInput = action.payload.name;
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
      state.currentTaskId = null;
      state.isLocked = false;
      state.hasStarted = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(checkForActiveTask.fulfilled, (state, action) => {
      if (action.payload) {
        const { task } = action.payload as { task: { id: string; name: string } };
        // Restore input state when active task is found
        state.currentTaskId = task.id;
        state.currentInput = task.name || ""; // Ensure we always have a string
        state.isLocked = true; // Lock input since task is active
        state.hasStarted = true;
      }
    });
  },
});

export const { setCurrentInput, setCurrentTask, lockInput, unlockInput, setHasStarted, resetInput } = taskInputSlice.actions;

export default taskInputSlice.reducer;