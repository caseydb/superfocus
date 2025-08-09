import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { updatePreferences } from "../../store/preferenceSlice";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const dispatch = useDispatch<AppDispatch>();
  const reduxUser = useSelector((state: RootState) => state.user);
  const preferences = useSelector((state: RootState) => state.preferences);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65" onClick={onClose}>
      <div
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl w-[95%] max-w-[800px] max-h-[85vh] flex flex-col border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-6 py-6 border-b border-gray-800/50">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Preferences</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {/* Timer and Task Settings Section */}
            <div className="bg-gray-800/50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-6">Timer and Task Settings</h3>

              <div className="space-y-6">
                {/* Task Selection Mode */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="md:flex-1">
                <label className="text-white font-medium">Task Selection Mode</label>
                <p className="text-sm text-gray-400 mt-1">Choose how to select tasks when clicking the input field</p>
              </div>
              <div className="relative md:flex-none">
                <select
                  value={preferences.task_selection_mode}
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    if (reduxUser.user_id) {
                      try {
                        await dispatch(
                          updatePreferences({
                            userId: reduxUser.user_id,
                            updates: { task_selection_mode: newValue }
                          })
                        ).unwrap();
                      } catch (error) {
                        console.error("Failed to update task selection mode:", error);
                      }
                    }
                  }}
                  className="w-full md:w-auto border border-gray-700 rounded-lg px-4 pr-10 py-3 bg-gray-700 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-600 md:min-w-[200px] text-center"
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
                    <p className="text-sm text-gray-400 mt-1">Check if still working after this duration</p>
                  </div>
                  <div className="relative md:flex-none">
                    <select
                      value={preferences.focus_check_time}
                      onChange={async (e) => {
                        const newValue = parseInt(e.target.value);
                        if (reduxUser.user_id) {
                          try {
                            await dispatch(
                              updatePreferences({
                                userId: reduxUser.user_id,
                                updates: { focus_check_time: newValue }
                              })
                            ).unwrap();
                          } catch (error) {
                            console.error("Failed to update focus check time:", error);
                          }
                        }
                      }}
                      className="w-full md:w-auto border border-gray-700 rounded-lg px-4 pr-10 py-3 bg-gray-700 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-600 md:min-w-[180px] text-center"
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
            <div className="hidden md:block bg-gray-800/50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 text-center">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘K</kbd>
                  <span className="text-gray-400 text-sm">Tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘J</kbd>
                  <span className="text-gray-400 text-sm">Notes</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘M</kbd>
                  <span className="text-gray-400 text-sm">Mute</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘H</kbd>
                  <span className="text-gray-400 text-sm">History</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘L</kbd>
                  <span className="text-gray-400 text-sm">Leaderboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300 text-sm font-mono">⌘S</kbd>
                  <span className="text-gray-400 text-sm">Analytics</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
