import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

export interface HistoryEntry {
  id: string;
  userId: string;
  displayName: string;
  task: string;
  duration: number;
  completedAt: string;
  formattedDuration: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
  error: string | null;
  roomSlug: string | null;
}

const initialState: HistoryState = {
  entries: [],
  loading: false,
  error: null,
  roomSlug: null,
};

// Async thunk to fetch history
export const fetchHistory = createAsyncThunk(
  "history/fetch",
  async (slug: string) => {
    const response = await fetch(`/api/history?slug=${slug}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch history");
    }
    
    return { history: data.history, slug };
  }
);

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    // Optimistic update when a task is completed
    addHistoryEntry: (state, action: PayloadAction<{
      taskId: string;
      userId: string;
      displayName: string;
      taskName: string;
      duration: number;
    }>) => {
      const { taskId, userId, displayName, taskName, duration } = action.payload;
      
      // Format duration
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const secs = duration % 60;
      const formattedDuration = hours > 0
        ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      const newEntry: HistoryEntry = {
        id: taskId,
        userId,
        displayName,
        task: taskName,
        duration,
        completedAt: new Date().toISOString(),
        formattedDuration
      };
      
      // Add to beginning of array (most recent first)
      state.entries.unshift(newEntry);
    },
    clearHistory: (state) => {
      state.entries = [];
      state.roomSlug = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.entries = action.payload.history;
        state.roomSlug = action.payload.slug;
      })
      .addCase(fetchHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch history";
      });
  },
});

export const { addHistoryEntry, clearHistory } = historySlice.actions;
export default historySlice.reducer;