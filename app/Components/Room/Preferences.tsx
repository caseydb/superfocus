import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
// TODO: Remove firebase imports when replacing with proper persistence
// import { rtdb } from "../../../lib/firebase";
// import { ref, set, onValue, off } from "firebase/database";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { updateUser, updateUserData } from "../../store/userSlice";
import { updatePreferences } from "../../store/preferenceSlice";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const { user, currentInstance } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const reduxUser = useSelector((state: RootState) => state.user);
  const preferences = useSelector((state: RootState) => state.preferences);

  // Preference states
  const [displayName, setDisplayName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  // Initialize display name from Redux user data
  useEffect(() => {
    if (reduxUser.first_name) {
      const fullName = reduxUser.last_name ? `${reduxUser.first_name} ${reduxUser.last_name}` : reduxUser.first_name;
      setDisplayName(fullName);
    } else if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [reduxUser.first_name, reduxUser.last_name, user?.displayName]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-6 sm:py-8 w-[95%] sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full flex flex-col items-center gap-4 sm:gap-6 border border-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-transparent"></div>
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white">Preferences</div>
          <button
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg sm:text-2xl text-gray-400 hover:text-white transition-colors cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Shortcuts Tips Banner */}
        <div className="w-full px-6 py-4 bg-gray-900/30 rounded-xl mb-6">
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

        <div className="w-full space-y-6">
          {/* Account Section */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Account</h3>

            {/* Edit Display Name */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Display Name</label>
                <p className="text-sm text-gray-400 mt-1">
                  {isEditingName ? "Enter your new display name" : displayName}
                </p>
              </div>
              {!isEditingName ? (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="px-3 py-1 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none"
                    maxLength={32}
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (displayName.trim()) {
                        const trimmedName = displayName.trim();

                        // Parse display name into first and last name
                        const nameParts = trimmedName.split(" ");
                        const firstName = nameParts[0];
                        const lastName = nameParts.slice(1).join(" ") || null;

                        // Optimistic update to Redux
                        dispatch(
                          updateUser({
                            first_name: firstName,
                            last_name: lastName,
                          })
                        );

                        // TODO: Replace with Firebase RTDB update for real-time presence
                        // Update the local user state for real-time presence (but not Firebase Auth)
                        if (user && currentInstance) {
                          // const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
                          // set(userRef, { ...user, displayName: trimmedName });
                          // Temporary: Just log the update
                        }

                        // Update PostgreSQL via API (this also updates Redux with server response)
                        try {
                          await dispatch(
                            updateUserData({
                              first_name: firstName,
                              last_name: lastName || undefined,
                            })
                          ).unwrap();
                        } catch {
                          // The Redux state will be updated with the server response
                          // If it fails, the optimistic update will be overwritten
                        }
                      }
                      setIsEditingName(false);
                    }}
                    className="px-3 py-1 bg-[#FFAA00] text-black rounded-lg hover:bg-[#FFB833] transition-colors font-semibold"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      // Reset to current Redux/Firebase state
                      if (reduxUser.first_name) {
                        const fullName = reduxUser.last_name
                          ? `${reduxUser.first_name} ${reduxUser.last_name}`
                          : reduxUser.first_name;
                        setDisplayName(fullName);
                      } else if (user?.displayName) {
                        setDisplayName(user.displayName);
                      }
                      setIsEditingName(false);
                    }}
                    className="px-3 py-1 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Timer and Task Settings Section */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Timer and Task Settings</h3>

            {/* Task Selection Mode */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-white font-medium">Task Selection Mode</label>
                <p className="text-sm text-gray-400 mt-1">Choose how to select tasks when clicking the input field</p>
              </div>
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
                className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none"
              >
                <option value="dropdown">Dropdown List</option>
                <option value="sidebar">Task Sidebar</option>
              </select>
            </div>

            {/* Focus Check */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Focus Check</label>
                <p className="text-sm text-gray-400 mt-1">Check if still working after this duration</p>
              </div>
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
                className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>
        </div>

        <button
          className="mt-4 sm:mt-6 bg-[#FFAA00] text-black font-extrabold text-lg sm:text-xl px-8 sm:px-10 py-3 rounded-lg shadow hover:scale-105 transition-transform"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
