import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off } from "firebase/database";

interface PreferencesProps {
  onClose: () => void;
}

export default function Preferences({ onClose }: PreferencesProps) {
  const { user } = useInstance();
  
  // Preference states
  const [autoStartTimer, setAutoStartTimer] = useState(false);
  const [showNotifications, setShowNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [inactivityTimeout, setInactivityTimeout] = useState("3600"); // Default 1 hour in seconds
  const [loading, setLoading] = useState(true);
  
  // Load preferences from Firebase on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const prefsRef = ref(rtdb, `users/${user.id}/preferences`);
    const handle = onValue(prefsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAutoStartTimer(data.autoStartTimer ?? false);
        setShowNotifications(data.showNotifications ?? true);
        setDarkMode(data.darkMode ?? true);
        setSoundEffects(data.soundEffects ?? true);
        setInactivityTimeout(data.inactivityTimeout ?? "3600");
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
      autoStartTimer,
      showNotifications,
      darkMode,
      soundEffects,
      inactivityTimeout,
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
          {/* Timer Settings Section */}
          <div className="bg-[#131722] rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Timer Settings</h3>
            
            {/* Auto-start Timer */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-white font-medium">Auto-start Timer</label>
                <p className="text-sm text-gray-400 mt-1">Automatically start timer when selecting a task</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !autoStartTimer;
                  setAutoStartTimer(newValue);
                  savePreferences({ autoStartTimer: newValue });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoStartTimer ? "bg-[#FFAA00]" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoStartTimer ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
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
          
          {/* Notifications Section */}
          <div className="bg-[#131722] rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Notifications</h3>
            
            {/* Show Notifications */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="text-white font-medium">Desktop Notifications</label>
                <p className="text-sm text-gray-400 mt-1">Get notified when others complete tasks</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !showNotifications;
                  setShowNotifications(newValue);
                  savePreferences({ showNotifications: newValue });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showNotifications ? "bg-[#FFAA00]" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showNotifications ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            
            {/* Sound Effects */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Sound Effects</label>
                <p className="text-sm text-gray-400 mt-1">Play sounds for timer events</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !soundEffects;
                  setSoundEffects(newValue);
                  savePreferences({ soundEffects: newValue });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  soundEffects ? "bg-[#FFAA00]" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    soundEffects ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
          
          {/* Appearance Section */}
          <div className="bg-[#131722] rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Appearance</h3>
            
            {/* Dark Mode */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-white font-medium">Dark Mode</label>
                <p className="text-sm text-gray-400 mt-1">Use dark theme throughout the app</p>
              </div>
              <button
                onClick={() => {
                  const newValue = !darkMode;
                  setDarkMode(newValue);
                  savePreferences({ darkMode: newValue });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? "bg-[#FFAA00]" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    darkMode ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
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