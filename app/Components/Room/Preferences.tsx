import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb, auth } from "../../../lib/firebase";
import { ref, set, onValue, off } from "firebase/database";
import { updateProfile } from "firebase/auth";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const { user, currentInstance } = useInstance();
  
  // Preference states
  const [inactivityTimeout, setInactivityTimeout] = useState("3600"); // Default 1 hour in seconds
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [taskSelectionMode, setTaskSelectionMode] = useState("dropdown"); // "dropdown" or "sidebar"
  
  // Load preferences from Firebase on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const prefsRef = ref(rtdb, `users/${user.id}/preferences`);
    const handle = onValue(prefsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setInactivityTimeout(data.inactivityTimeout ?? "3600");
        setTaskSelectionMode(data.taskSelectionMode ?? "dropdown");
      }
      setLoading(false);
    });
    
    return () => off(prefsRef, "value", handle);
  }, [user?.id]);
  
  // Save preferences to Firebase
  const savePreferences = (updates: Record<string, any>) => {
    if (!user?.id) return;
    
    const prefsRef = ref(rtdb, `users/${user.id}/preferences`);
    set(prefsRef, {
      inactivityTimeout,
      taskSelectionMode,
      ...updates,
      lastUpdated: Date.now()
    });
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#181f2a] rounded-3xl shadow-2xl px-4 sm:px-6 md:px-10 py-6 sm:py-8 w-[95%] sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full flex flex-col items-center gap-4 sm:gap-6 border-4 border-[#181f2a] max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-2">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-transparent"></div>
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white">Preferences</div>
          <button
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#232b3a] flex items-center justify-center text-lg sm:text-2xl text-gray-400 hover:text-white transition-colors cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        
        <div className="w-full space-y-6">
          {/* Account Section */}
          <div className="bg-[#131722] rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Account</h3>
            
            {/* Edit Display Name */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Display Name</label>
                <p className="text-sm text-gray-400 mt-1">{isEditingName ? "Enter your new display name" : displayName}</p>
              </div>
              {!isEditingName ? (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="px-4 py-2 bg-[#232b3a] text-white rounded-lg hover:bg-[#2a3444] transition-colors"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="px-3 py-1 bg-[#232b3a] text-white rounded-lg border border-gray-700 focus:border-[#FFAA00] outline-none"
                    maxLength={32}
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (displayName.trim() && displayName !== user?.displayName) {
                        if (auth.currentUser) {
                          await updateProfile(auth.currentUser, { displayName: displayName.trim() });
                        }
                        // Update the local user state
                        if (user) {
                          user.displayName = displayName.trim();
                          if (currentInstance) {
                            const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
                            set(userRef, { ...user, displayName: displayName.trim() });
                          }
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
                      setDisplayName(user?.displayName || "");
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
          <div className="bg-[#131722] rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Timer and Task Settings</h3>
            
            {/* Task Selection Mode */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-white font-medium">Task Selection Mode</label>
                <p className="text-sm text-gray-400 mt-1">Choose how to select tasks when clicking the input field</p>
              </div>
              <select
                value={taskSelectionMode}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setTaskSelectionMode(newValue);
                  savePreferences({ taskSelectionMode: newValue });
                }}
                className="bg-[#232b3a] text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-[#FFAA00] outline-none"
              >
                <option value="dropdown">Dropdown List</option>
                <option value="sidebar">Task Sidebar</option>
              </select>
            </div>
            
            {/* Inactivity Timeout */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Inactivity Check</label>
                <p className="text-sm text-gray-400 mt-1">Check if still working after this duration</p>
              </div>
              <select
                value={inactivityTimeout}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setInactivityTimeout(newValue);
                  savePreferences({ inactivityTimeout: newValue });
                }}
                className="bg-[#232b3a] text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-[#FFAA00] outline-none"
              >
                <option value="900">15 minutes</option>
                <option value="1800">30 minutes</option>
                <option value="3600">1 hour</option>
                <option value="7200">2 hours</option>
                <option value="10800">3 hours</option>
                <option value="14400">4 hours</option>
                <option value="never">Never</option>
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