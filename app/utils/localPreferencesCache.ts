// Local storage cache for guest users' preferences
interface PreferencesCache {
  toggle_notes?: boolean;
  toggle_counter?: boolean;
  toggle_pomodoro?: boolean;
  pomodoro_duration?: number;
  toggle_pomodoro_overtime?: boolean;
  sound_volume?: number;
  task_selection_mode?: string;
  focus_check_time?: number;
  analytics_date_pick?: string;
  analytics_overview?: string;
  history_user_filter?: string;
  history_date_filter?: string;
  mode?: "stopwatch" | "countdown";
  weekly_analytics_email?: boolean;
}

class LocalPreferencesCache {
  private static STORAGE_KEY = 'locked_in_guest_preferences';

  static getPreferences(): PreferencesCache {
    if (typeof window === 'undefined') return {};
    
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (!cached) return {};
      
      return JSON.parse(cached);
    } catch {
      return {};
    }
  }

  static savePreferences(preferences: PreferencesCache): void {
    if (typeof window === 'undefined') return;
    
    try {
      // Merge with existing preferences
      const existing = this.getPreferences();
      const updated = { ...existing, ...preferences };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch {
    }
  }

  static clearPreferences(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
    }
  }
}

export default LocalPreferencesCache;
