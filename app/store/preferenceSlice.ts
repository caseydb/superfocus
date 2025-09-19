import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
// Note: For now, preferences are Redux-only (no persistence)
import LocalPreferencesCache from "../utils/localPreferencesCache";

export interface PreferenceState {
  toggle_notes: boolean;
  toggle_counter: boolean;
  toggle_pomodoro: boolean;
  pomodoro_duration: number;
  toggle_pomodoro_overtime: boolean;
  sound_volume: number;
  task_selection_mode: string;
  focus_check_time: number;
  analytics_date_pick: string;
  analytics_overview: string;
  history_user_filter: string;
  history_date_filter: string;
  mode: "stopwatch" | "countdown";
  weekly_analytics_email: boolean; // local-only opt-in for now
  weekly_leaderboard_email: boolean;
  // UI theme preferences (local-first; safe to keep client-side)
  theme?: string; // e.g. "dark" | "light" | "blue"
  paused_flash?: boolean; // flash screen while paused
  loading: boolean;
  error: string | null;
  hydrated: boolean; // indicates preferences fetched/ready
}

// Load initial state from cache if available
const mergeWithCache = (base: PreferenceState): PreferenceState => {
  const cached = LocalPreferencesCache.getPreferences();
  if (!cached || Object.keys(cached).length === 0) {
    return base;
  }

  return {
    ...base,
    ...cached,
  };
};

const getInitialState = (): PreferenceState => {
  const defaults: PreferenceState = {
    toggle_notes: false,
    toggle_counter: false,
    toggle_pomodoro: false,
    pomodoro_duration: 30,
    toggle_pomodoro_overtime: true,
    sound_volume: 50,
    task_selection_mode: "sidebar",
    focus_check_time: 120,
    analytics_date_pick: "all_time",
    analytics_overview: "tasks",
    history_user_filter: "all_tasks",
    history_date_filter: "this_week",
    mode: "stopwatch",
    weekly_analytics_email: true,
    weekly_leaderboard_email: true,
    theme: "dark",
    paused_flash: false,
    loading: false,
    error: null,
    hydrated: false,
  };

  return mergeWithCache(defaults);
};

const initialState: PreferenceState = getInitialState();

// Async thunk to fetch preferences
export const fetchPreferences = createAsyncThunk("preferences/fetch", async (userId: string, { getState }) => {
  // Check if user is guest
  const state = getState() as { user?: { isGuest?: boolean }; preferences: PreferenceState };
  if (state.user?.isGuest) {
    // For guest users, merge Redux state with cached preferences
    const merged = mergeWithCache(state.preferences);
    return {
      ...merged,
      hydrated: true,
    };
  }

  const response = await fetch(`/api/preferences?userId=${userId}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch preferences");
  }

  return data.preferences;
});

// Async thunk to update preferences
export const updatePreferences = createAsyncThunk(
  "preferences/update",
  async ({ userId, updates }: { userId: string; updates: Partial<PreferenceState> }, { getState }) => {
    // Check if user is guest
    const state = getState() as { user?: { isGuest?: boolean } };
    if (state.user?.isGuest) {
      // For guest users, just return the updates without API call
      // The preferences are already updated in Redux via setPreference
      return updates;
    }

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
    hydrateFromCache: (state) => {
      const cached = LocalPreferencesCache.getPreferences();
      if (!cached || Object.keys(cached).length === 0) {
        state.hydrated = true;
        return;
      }

      Object.assign(state, cached);
      state.hydrated = true;
    },
    // Local state updates (optimistic updates)
    setPreference: <K extends keyof PreferenceState>(
      state: PreferenceState,
      action: PayloadAction<{ key: K; value: PreferenceState[K] }>
    ) => {
      const { key, value } = action.payload;
      if (key in state && key !== "loading" && key !== "error") {
        // Type-safe assignment
        Object.assign(state, { [key]: value });

        // No persistence for now; Redux-only state updates
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
        state.hydrated = false;
      })
      .addCase(fetchPreferences.fulfilled, (state, action) => {
        state.loading = false;
        // Update all preference fields
        Object.assign(state, action.payload);
        state.hydrated = true;
      })
      .addCase(fetchPreferences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch preferences";
        // Mark hydrated to avoid blocking UI/apply logic even on error
        state.hydrated = true;
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

export const { setPreference, resetPreferences, hydrateFromCache } = preferenceSlice.actions;
export default preferenceSlice.reducer;
