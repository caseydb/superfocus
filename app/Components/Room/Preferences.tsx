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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95" onClick={onClose}>
      <div
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[800px] h-[85vh] flex flex-col border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Preferences</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-0 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Shortcuts Tips Banner - Hidden on mobile */}
          <div className="hidden md:block bg-gray-800/50 rounded-xl p-4">
            <div className="flex flex-col items-center justify-center text-xs text-gray-500 gap-3">
            <div className="text-gray-400 font-semibold mb-1">Shortcuts</div>
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘K</span>
                <span>Tasks</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘J</span>
                <span>Notes</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘M</span>
                <span>Mute</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘H</span>
                <span>History</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘L</span>
                <span>Leaderboard</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">⌘S</span>
                <span>Analytics</span>
              </div>
            </div>
          </div>
          </div>

          {/* Timer and Task Settings Section */}
          <div className="bg-gray-800/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Timer and Task Settings</h3>

            {/* Task Selection Mode */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
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
      </div>
    </div>
  );
}
