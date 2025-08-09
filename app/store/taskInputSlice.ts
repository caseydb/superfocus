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
      console.log('[taskInputSlice] setCurrentInput called with:', action.payload);
      console.log('[taskInputSlice] Previous input:', state.currentInput);
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
      console.log('[taskInputSlice] resetInput called - clearing all input state');
      console.log('[taskInputSlice] Was:', { 
        input: state.currentInput, 
        taskId: state.currentTaskId,
        locked: state.isLocked,
        started: state.hasStarted
      });
      state.currentInput = "";
      state.currentTaskId = null;
      state.isLocked = false;
      state.hasStarted = false;
      console.log('[taskInputSlice] Input state cleared');
    },
  },
  extraReducers: (builder) => {
    builder.addCase(checkForActiveTask.fulfilled, (state, action) => {
      console.log('[taskInputSlice] checkForActiveTask.fulfilled received');
      console.log('[taskInputSlice] Payload:', action.payload);
      if (action.payload) {
        const { task } = action.payload as { task: { id: string; name: string } };
        console.log('[taskInputSlice] ⚠️ RESTORING INPUT from checkForActiveTask!');
        console.log('[taskInputSlice] Task found in TaskBuffer:', task);
        console.log('[taskInputSlice] Setting input to:', task.name);
        console.log('[taskInputSlice] Previous input was:', state.currentInput);
        // Restore input state when active task is found
        state.currentTaskId = task.id;
        state.currentInput = task.name;
        state.isLocked = true; // Lock input since task is active
        state.hasStarted = true;
        console.log('[taskInputSlice] Input restored to:', task.name);
      } else {
        console.log('[taskInputSlice] No active task found, input remains:', state.currentInput);
      }
    });
  },
});

export const { setCurrentInput, setCurrentTask, lockInput, unlockInput, setHasStarted, resetInput } = taskInputSlice.actions;

export default taskInputSlice.reducer;