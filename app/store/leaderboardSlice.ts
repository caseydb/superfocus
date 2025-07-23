import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

export interface LeaderboardEntry {
  user_id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  total_tasks: number;
  total_duration: number;
}

interface LeaderboardState {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  roomId: string | null;
  lastFetched: number | null;
}

const initialState: LeaderboardState = {
  entries: [],
  loading: false,
  error: null,
  roomId: null,
  lastFetched: null,
};

// Async thunk to fetch leaderboard data
export const fetchLeaderboard = createAsyncThunk(
  "leaderboard/fetch",
  async ({ roomId }: { roomId: string }) => {
    const response = await fetch(`/api/leaderboard?roomId=${roomId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch leaderboard");
    }
    
    console.log("[LeaderboardSlice] Leaderboard loaded:", data.data);
    return { entries: data.data, roomId };
  }
);

// Async thunk to refresh leaderboard after task completion
export const refreshLeaderboard = createAsyncThunk(
  "leaderboard/refresh",
  async (_, { getState }) => {
    const state = getState() as { leaderboard: LeaderboardState };
    const { roomId } = state.leaderboard;
    
    if (!roomId) {
      throw new Error("No room ID available for refresh");
    }
    
    const response = await fetch(`/api/leaderboard?roomId=${roomId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to refresh leaderboard");
    }
    
    console.log("[LeaderboardSlice] Leaderboard refreshed:", data.data);
    return data.data;
  }
);

const leaderboardSlice = createSlice({
  name: "leaderboard",
  initialState,
  reducers: {
    // Optimistically update leaderboard when a task is completed
    updateLeaderboardOptimistically: (state, action: PayloadAction<{
      userId: string;
      firstName: string;
      lastName: string;
      profileImage: string | null;
      taskDuration: number;
    }>) => {
      const { userId, firstName, lastName, profileImage, taskDuration } = action.payload;
      
      // Find existing user entry
      const existingEntry = state.entries.find(entry => entry.user_id === userId);
      
      if (existingEntry) {
        // Update existing entry
        existingEntry.total_tasks += 1;
        existingEntry.total_duration += taskDuration;
      } else {
        // Add new entry
        state.entries.push({
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          profile_image: profileImage,
          total_tasks: 1,
          total_duration: taskDuration,
        });
      }
      
      // Re-sort entries by total duration (descending)
      state.entries.sort((a, b) => b.total_duration - a.total_duration);
    },
    clearLeaderboard: (state) => {
      state.entries = [];
      state.roomId = null;
      state.lastFetched = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch leaderboard
      .addCase(fetchLeaderboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLeaderboard.fulfilled, (state, action) => {
        state.loading = false;
        state.entries = action.payload.entries;
        state.roomId = action.payload.roomId;
        state.lastFetched = Date.now();
      })
      .addCase(fetchLeaderboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch leaderboard";
      })
      // Refresh leaderboard
      .addCase(refreshLeaderboard.pending, (state) => {
        state.error = null;
      })
      .addCase(refreshLeaderboard.fulfilled, (state, action) => {
        state.entries = action.payload;
        state.lastFetched = Date.now();
      })
      .addCase(refreshLeaderboard.rejected, (state, action) => {
        state.error = action.error.message || "Failed to refresh leaderboard";
      });
  },
});

export const { updateLeaderboardOptimistically, clearLeaderboard } = leaderboardSlice.actions;
export default leaderboardSlice.reducer;