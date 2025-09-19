import { configureStore } from '@reduxjs/toolkit';
import userReducer from './userSlice';
import taskReducer from './taskSlice';
import realtimeReducer from './realtimeSlice';
import notesReducer from './notesSlice';
import preferenceReducer, { PreferenceState } from './preferenceSlice';
import historyReducer from './historySlice';
import leaderboardReducer from './leaderboardSlice';
import taskInputReducer from './taskInputSlice';
import timerReducer from './timerSlice';
import workspaceReducer from './workspaceSlice';
import counterReducer from './counterSlice';
import LocalPreferencesCache, { PreferencesCache } from '../utils/localPreferencesCache';

export const store = configureStore({
  reducer: {
    user: userReducer,
    tasks: taskReducer,
    realtime: realtimeReducer,
    notes: notesReducer,
    preferences: preferenceReducer,
    history: historyReducer,
    leaderboard: leaderboardReducer,
    taskInput: taskInputReducer,
    timer: timerReducer,
    workspace: workspaceReducer,
    counter: counterReducer,
  },
});

type PersistablePreferenceKey = keyof PreferencesCache;
const PREFERENCE_KEYS_TO_CACHE: PersistablePreferenceKey[] = [
  'toggle_notes',
  'toggle_counter',
  'toggle_pomodoro',
  'pomodoro_duration',
  'toggle_pomodoro_overtime',
  'sound_volume',
  'task_selection_mode',
  'focus_check_time',
  'analytics_date_pick',
  'analytics_overview',
  'history_user_filter',
  'history_date_filter',
  'mode',
  'weekly_analytics_email',
  'weekly_leaderboard_email',
  'theme',
  'paused_flash',
];

const pickGuestPreferences = (preferences: PreferenceState): PreferencesCache => {
  const picked: PreferencesCache = {};
  for (const key of PREFERENCE_KEYS_TO_CACHE) {
    const value = preferences[key];
    if (value !== undefined) {
      (picked as Record<PersistablePreferenceKey, unknown>)[key] = value;
    }
  }
  return picked;
};

if (typeof window !== 'undefined') {
  let previousPreferences = pickGuestPreferences(store.getState().preferences);

  store.subscribe(() => {
    const state = store.getState();
    const isGuest = state.user.isGuest;

    if (!isGuest) {
      previousPreferences = pickGuestPreferences(state.preferences);
      return;
    }

    const currentPreferences = pickGuestPreferences(state.preferences);
    const updates: PreferencesCache = {};
    let hasChanges = false;

    for (const key of PREFERENCE_KEYS_TO_CACHE) {
      if (currentPreferences[key] !== previousPreferences[key]) {
        (updates as Record<PersistablePreferenceKey, unknown>)[key] = currentPreferences[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      LocalPreferencesCache.savePreferences(updates);
    }

    previousPreferences = currentPreferences;
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
