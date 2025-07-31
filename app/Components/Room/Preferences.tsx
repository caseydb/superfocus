import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set } from "firebase/database";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { updateUser, updateUserData } from "../../store/userSlice";
import { updatePreferences } from "../../store/preferenceSlice";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const { user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const reduxUser = useSelector((state: RootState) => state.user);
  const preferences = useSelector((state: RootState) => state.preferences);

  // Preference states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState("");

  // Initialize names from Redux user data
  useEffect(() => {
    if (reduxUser.first_name) {
      setFirstName(reduxUser.first_name);
      setLastName(reduxUser.last_name || "");
    } else if (user?.displayName) {
      const nameParts = user.displayName.split(" ");
      setFirstName(nameParts[0]);
      setLastName(nameParts.slice(1).join(" ") || "");
    }
  }, [reduxUser.first_name, reduxUser.last_name, user?.displayName]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-6 sm:py-8 w-[95%] sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full flex flex-col items-center gap-4 sm:gap-6 border border-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-full mb-2 relative">
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white">Preferences</div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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

            {/* Edit Name */}
            <div className="space-y-4">
              {/* First Name */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="text-white font-medium">First Name</label>
                  {!isEditingName && (
                    <p className="text-sm text-gray-400 mt-1">{firstName || "Not set"}</p>
                  )}
                </div>
                {!isEditingName ? (
                  <button
                    onClick={() => {
                      setIsEditingName(true);
                      setNameError("");
                    }}
                    className="px-4 py-3 bg-gray-700 text-gray-100 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex-1 max-w-xs">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        setNameError("");
                      }}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none"
                      placeholder="Enter first name"
                      maxLength={32}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              {/* Last Name */}
              {isEditingName && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <label className="text-white font-medium">Last Name</label>
                  </div>
                  <div className="flex-1 max-w-xs">
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none"
                      placeholder="Enter last name"
                      maxLength={32}
                    />
                  </div>
                </div>
              )}

              {/* Last Name display when not editing */}
              {!isEditingName && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <label className="text-white font-medium">Last Name</label>
                    <p className="text-sm text-gray-400 mt-1">{lastName || "Not set"}</p>
                  </div>
                </div>
              )}

              {/* Error message */}
              {nameError && (
                <p className="text-red-400 text-sm mt-2">{nameError}</p>
              )}

              {/* Save/Cancel buttons */}
              {isEditingName && (
                <div className="flex gap-2 mt-4 justify-end">
                  <button
                    onClick={async () => {
                      // Validate first name
                      if (!firstName.trim()) {
                        setNameError("First name is required");
                        return;
                      }

                      const trimmedFirstName = firstName.trim();
                      const trimmedLastName = lastName.trim();

                      // Optimistic update to Redux
                      dispatch(
                        updateUser({
                          first_name: trimmedFirstName,
                          last_name: trimmedLastName || null,
                        })
                      );

                      // Update PostgreSQL via API
                      try {
                        await dispatch(
                          updateUserData({
                            first_name: trimmedFirstName,
                            last_name: trimmedLastName || undefined,
                          })
                        ).unwrap();
                        
                        // Update Firebase Users with the new name
                        if (user?.id) {
                          const userRef = ref(rtdb, `Users/${user.id}`);
                          await set(userRef, {
                            firstName: trimmedFirstName,
                            lastName: trimmedLastName || null,
                            updatedAt: Date.now()
                          });
                        }
                        
                        setIsEditingName(false);
                        setNameError("");
                      } catch {
                        setNameError("Failed to update name. Please try again.");
                        // Revert optimistic update on failure
                        dispatch(
                          updateUser({
                            first_name: reduxUser.first_name,
                            last_name: reduxUser.last_name,
                          })
                        );
                      }
                    }}
                    className="px-4 py-2 bg-[#FFAA00] text-black rounded-lg hover:bg-[#FFB833] transition-colors font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      // Reset to current Redux state
                      setFirstName(reduxUser.first_name || "");
                      setLastName(reduxUser.last_name || "");
                      setIsEditingName(false);
                      setNameError("");
                    }}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
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
              <div className="relative">
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
                  className="border border-gray-700 rounded-lg px-4 pr-10 py-3 bg-gray-700 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-600 min-w-[200px] text-center"
                >
                  <option value="dropdown" className="bg-gray-900 text-gray-100 cursor-pointer">Dropdown List</option>
                  <option value="sidebar" className="bg-gray-900 text-gray-100 cursor-pointer">Task Sidebar</option>
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
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Focus Check</label>
                <p className="text-sm text-gray-400 mt-1">Check if still working after this duration</p>
              </div>
              <div className="relative">
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
                  className="border border-gray-700 rounded-lg px-4 pr-10 py-3 bg-gray-700 text-gray-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-600 min-w-[180px] text-center"
                >
                  <option value="15" className="bg-gray-900 text-gray-100 cursor-pointer">15 minutes</option>
                  <option value="30" className="bg-gray-900 text-gray-100 cursor-pointer">30 minutes</option>
                  <option value="45" className="bg-gray-900 text-gray-100 cursor-pointer">45 minutes</option>
                  <option value="60" className="bg-gray-900 text-gray-100 cursor-pointer">1 hour</option>
                  <option value="120" className="bg-gray-900 text-gray-100 cursor-pointer">2 hours</option>
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
