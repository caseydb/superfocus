import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

interface PreferenceState {
  toggle_notes: boolean;
  toggle_pomodoro: boolean;
  toggle_pomodoro_overtime: boolean;
  sound_volume: number;
  task_selection_mode: string;
  focus_check_time: number;
  date_picker: string;
  mode: "stopwatch" | "countdown";
  loading: boolean;
  error: string | null;
}

const initialState: PreferenceState = {
  toggle_notes: false,
  toggle_pomodoro: false,
  toggle_pomodoro_overtime: true,
  sound_volume: 50,
  task_selection_mode: "sidebar",
  focus_check_time: 120,
  date_picker: "all_time",
  mode: "stopwatch",
  loading: false,
  error: null,
};

// Async thunk to fetch preferences
export const fetchPreferences = createAsyncThunk(
  "preferences/fetch",
  async (userId: string) => {
    const response = await fetch(`/api/preferences?userId=${userId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch preferences");
    }
    
    return data.preferences;
  }
);

// Async thunk to update preferences
export const updatePreferences = createAsyncThunk(
  "preferences/update",
  async ({ userId, updates }: { userId: string; updates: Partial<PreferenceState> }) => {
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        ...updates,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "Failed to update preferences");
    }
    
    return data.preferences;
  }
);

const preferenceSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    // Local state updates (optimistic updates)
    setPreference: <K extends keyof PreferenceState>(
      state: PreferenceState,
      action: PayloadAction<{ key: K; value: PreferenceState[K] }>
    ) => {
      const { key, value } = action.payload;
      if (key in state && key !== "loading" && key !== "error") {
        // Type-safe assignment
        Object.assign(state, { [key]: value });
      }
    },
    resetPreferences: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch preferences
      .addCase(fetchPreferences.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPreferences.fulfilled, (state, action) => {
        state.loading = false;
        // Update all preference fields
        Object.assign(state, action.payload);
      })
      .addCase(fetchPreferences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch preferences";
      })
      // Update preferences
      .addCase(updatePreferences.pending, (state) => {
        state.error = null;
      })
      .addCase(updatePreferences.fulfilled, (state, action) => {
        // Update all preference fields with the response
        Object.assign(state, action.payload);
      })
      .addCase(updatePreferences.rejected, (state, action) => {
        state.error = action.error.message || "Failed to update preferences";
      });
  },
});

export const { setPreference, resetPreferences } = preferenceSlice.actions;
export default preferenceSlice.reducer;