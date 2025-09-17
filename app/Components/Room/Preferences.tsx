import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const dispatch = useDispatch<AppDispatch>();
  const reduxUser = useSelector((state: RootState) => state.user);
  const preferences = useSelector((state: RootState) => state.preferences);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 sf-preferences-overlay sf-modal-overlay" onClick={onClose}>
      <div
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl w-[95%] max-w-[800px] max-h-[85vh] flex flex-col border border-gray-800 relative sf-preferences sf-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-5 py-4 border-b border-gray-800/50 sf-header sf-modal-header">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#FFAA00]">Preferences</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-5 w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer sf-close sf-modal-close"
          >
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {/* Theme Section (Redux-only for now) */}
            <div className="bg-[#0B0E16] border border-gray-800 rounded-2xl p-4 shadow-md sf-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <h3 className="text-base font-bold text-white">Theme</h3>
                <label className="flex items-center gap-3 cursor-pointer select-none self-start">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border border-gray-600 bg-gray-800"
                    style={{ accentColor: '#FFAA00' }}
                    checked={Boolean(preferences.paused_flash)}
                    onChange={async (e) => {
                      const value = e.target.checked;
                      dispatch(setPreference({ key: 'paused_flash', value }));
                      if (reduxUser.user_id && reduxUser.isGuest === false) {
                        try {
                          await dispatch(updatePreferences({ userId: reduxUser.user_id, updates: { paused_flash: value } })).unwrap();
                        } catch {
                          // ignore API errors
                        }
                      }
                    }}
                  />
                  <span className="text-gray-200 text-sm">Flash screen when paused</span>
                </label>
              </div>
              {/* Visual theme previews */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                {[
                  {
                    value: 'dark',
                    label: 'Dark',
                    bg: '#0a0b0b',
                    text: '#ededed',
                    card: '#181a1b',
                    border: '#23272b',
                  },
                  {
                    value: 'blue',
                    label: 'Blue',
                    bg: 'radial-gradient(1200px 800px at 10% 10%, #0f224a 0%, #0b1835 40%, #0a1228 100%)',
                    text: '#e6f2ff',
                    card: 'rgba(255,255,255,0.06)',
                    border: 'rgba(255,255,255,0.08)',
                  },
                  {
                    value: 'light',
                    label: 'Light',
                    bg: '#ffffff',
                    text: '#262626',
                    card: '#ffffff',
                    border: '#e5e7eb',
                  },
                  {
                    value: 'purple',
                    label: 'Purple',
                    bg: 'radial-gradient(1200px 800px at 10% 10%, #2a0f4a 0%, #1e0b35 40%, #140a28 100%)',
                    text: '#f2e9ff',
                    card: 'rgba(255,255,255,0.08)',
                    border: 'rgba(255,255,255,0.12)',
                  },
                ].map((opt) => {
                  const selected = preferences.theme === opt.value;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={async () => {
                        dispatch(setPreference({ key: 'theme', value: opt.value }));
                        if (reduxUser.user_id && reduxUser.isGuest === false) {
                          try {
                            await dispatch(updatePreferences({ userId: reduxUser.user_id, updates: { theme: opt.value } })).unwrap();
                          } catch {
                            // ignore API errors; local state already updated
                          }
                        }
                      }}
                      className={`group w-full rounded-xl overflow-hidden border transition-all ${
                        selected ? 'border-[#FFAA00] ring-2 ring-[#FFAA00]/40' : 'border-gray-700 hover:border-gray-600'
                      }`}
                      style={{ background: 'transparent' }}
                    >
                      {/* Mini window preview */}
                      <div
                        className="w-full h-28 relative"
                        style={{ background: opt.bg }}
                      >
                        <div
                          className="absolute inset-x-3 top-3 rounded-lg"
                          style={{ background: opt.card, border: `1px solid ${opt.border}` }}
                        >
                          <div className="flex items-center justify-between px-3 py-2">
                            <div className="h-3 w-16 rounded" style={{ background: opt.border }} />
                            <div className="flex gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ background: opt.border }} />
                              <div className="h-3 w-3 rounded-full" style={{ background: opt.border }} />
                            </div>
                          </div>
                          <div className="px-3 pb-3">
                            <div className="h-5 w-24 rounded mb-1" style={{ background: opt.border }} />
                            <div className="h-3 w-32 rounded" style={{ background: opt.border }} />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                          <div className="h-2 w-20 rounded" style={{ background: opt.border }} />
                          <div className="h-2 w-14 rounded" style={{ background: opt.border }} />
                        </div>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between text-white">
                        <span className="font-medium text-sm">{opt.label}</span>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${selected ? 'bg-[#FFAA00]' : 'bg-gray-500 group-hover:bg-gray-400'}`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notifications Section */}
            <div className="bg-[#0B0E16] border border-gray-800 rounded-2xl p-4 shadow-md sf-card">
              <h3 className="text-base font-bold text-white mb-3">Email Notifications</h3>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label className="text-white font-medium">Weekly Analytics</label>
                  <p className="text-sm text-gray-500 mt-1">Get a weekly analytics email summarizing your last 7 days.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border border-gray-600 bg-gray-800"
                      style={{ accentColor: '#FFAA00' }}
                      checked={Boolean(preferences.weekly_analytics_email)}
                      onChange={async (e) => {
                        const value = e.target.checked;
                        // Optimistic update
                        dispatch(setPreference({ key: 'weekly_analytics_email', value }));
                        // Persist for authenticated users
                        if (reduxUser.user_id && reduxUser.isGuest === false) {
                          try {
                            await dispatch(updatePreferences({
                              userId: reduxUser.user_id,
                              updates: { weekly_analytics_email: value }
                            })).unwrap();
                          } catch {
                            // Revert on failure
                            dispatch(setPreference({ key: 'weekly_analytics_email', value: !value }));
                          }
                        }
                      }}
                    />
                    <span className="text-gray-200 text-sm">Weekly Analytics</span>
                  </label>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4 mt-4">
                <div>
                  <label className="text-white font-medium">Weekly Leaderboard</label>
                  <p className="text-sm text-gray-500 mt-1">Get a weekly email where you placed on the leaderboard.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border border-gray-600 bg-gray-800"
                      style={{ accentColor: '#FFAA00' }}
                      checked={Boolean(preferences.weekly_leaderboard_email)}
                      onChange={async (e) => {
                        const value = e.target.checked;
                        // Optimistic update
                        dispatch(setPreference({ key: 'weekly_leaderboard_email', value }));
                        // Persist for authenticated users
                        if (reduxUser.user_id && reduxUser.isGuest === false) {
                          try {
                            await dispatch(updatePreferences({
                              userId: reduxUser.user_id,
                              updates: { weekly_leaderboard_email: value }
                            })).unwrap();
                          } catch {
                            // Revert on failure
                            dispatch(setPreference({ key: 'weekly_leaderboard_email', value: !value }));
                          }
                        }
                      }}
                    />
                    <span className="text-gray-200 text-sm">Weekly Leaderboard</span>
                  </label>
                </div>
              </div>
              
            </div>

            {/* Timer and Task Settings Section */}
            <div className="bg-[#0B0E16] border border-gray-800 rounded-2xl p-4 shadow-md sf-card">
              <h3 className="text-base font-bold text-white mb-3">Timer and Task Settings</h3>

              <div className="space-y-4">
                {/* Task Selection Mode */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="md:flex-1">
                    <label className="text-white font-medium">Task Selection Mode</label>
                    <p className="text-sm text-gray-500 mt-1">Choose how to select tasks when clicking the input field</p>
                  </div>
                  <div className="relative md:flex-none">
                    <select
                      className="w-full md:w-auto border border-gray-700 rounded-lg px-3 pr-9 py-2.5 bg-gray-800 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-700 md:min-w-[200px] text-center sf-select"
                      value={preferences.task_selection_mode}
                      onChange={async (e) => {
                        const newValue = e.target.value;
                        // Always update local state (and cache for guests)
                        dispatch(setPreference({ key: 'task_selection_mode', value: newValue }));

                        // Only update API for authenticated users
                        if (reduxUser.user_id && reduxUser.isGuest === false) {
                          try {
                            await dispatch(
                              updatePreferences({
                                userId: reduxUser.user_id,
                                updates: { task_selection_mode: newValue }
                              })
                            ).unwrap();
                          } catch {
                            // Silently fail for API updates
                          }
                        }
                      }}
                    >
                      <option value="dropdown" className="bg-[#0E1119] text-gray-100 cursor-pointer">Dropdown List</option>
                      <option value="sidebar" className="bg-[#0E1119] text-gray-100 cursor-pointer">Task Sidebar</option>
                    </select>
                    {/* Custom Chevron Icon */}
                    <svg
                      className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Focus Check */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="md:flex-1">
                    <label className="text-white font-medium">Focus Check</label>
                    <p className="text-sm text-gray-500 mt-1">Check if still working after this duration before pausing timer</p>
                  </div>
                  <div className="relative md:flex-none">
                    <select
                      className="w-full md:w-auto border border-gray-700 rounded-lg px-3 pr-9 py-2.5 bg-gray-800 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-700 md:min-w-[180px] text-center sf-select"
                      value={preferences.focus_check_time}
                      onChange={async (e) => {
                        const newValue = parseInt(e.target.value);
                        // Always update local state (and cache for guests)
                        dispatch(setPreference({ key: 'focus_check_time', value: newValue }));
                        
                        // Only update API for authenticated users
                        if (reduxUser.user_id && reduxUser.isGuest === false) {
                          try {
                            await dispatch(
                              updatePreferences({
                                userId: reduxUser.user_id,
                                updates: { focus_check_time: newValue }
                              })
                            ).unwrap();
                          } catch {
                            // Silently fail for API updates
                          }
                        }
                      }}
                    >
                      <option value="15" className="bg-[#0E1119] text-gray-100 cursor-pointer">15 minutes</option>
                      <option value="30" className="bg-[#0E1119] text-gray-100 cursor-pointer">30 minutes</option>
                      <option value="45" className="bg-[#0E1119] text-gray-100 cursor-pointer">45 minutes</option>
                      <option value="60" className="bg-[#0E1119] text-gray-100 cursor-pointer">1 hour</option>
                      <option value="120" className="bg-[#0E1119] text-gray-100 cursor-pointer">2 hours</option>
                    </select>
                    {/* Custom Chevron Icon */}
                    <svg
                      className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            

            {/* Shortcuts Section - Hidden on mobile */}
            <div className="hidden md:block bg-[#0B0E16] border border-gray-800 rounded-2xl p-4 shadow-md sf-card">
              <h3 className="text-base font-bold text-white mb-2 text-center">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">P</kbd>
                  <span className="text-gray-500 text-sm">Preferences</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">T</kbd>
                  <span className="text-gray-500 text-sm">Tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">A</kbd>
                  <span className="text-gray-500 text-sm">Analytics</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">L</kbd>
                  <span className="text-gray-500 text-sm">Leaderboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">H</kbd>
                  <span className="text-gray-500 text-sm">History</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">W</kbd>
                  <span className="text-gray-500 text-sm">Workspace</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">J</kbd>
                  <span className="text-gray-500 text-sm">Notes</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">M</kbd>
                  <span className="text-gray-500 text-sm">Mute</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
