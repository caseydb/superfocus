"use client";

import React, { useEffect, useState } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, set, onValue, off } from "firebase/database";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load current settings from Firebase
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const settingsRef = ref(rtdb, "adminSettings/leaderboardEnabled");

    const unsubscribe = onValue(settingsRef, (snapshot) => {
      const value = snapshot.val();
      // Default to true if not set
      setLeaderboardEnabled(value !== false);
      setLoading(false);
    });

    return () => off(settingsRef, "value", unsubscribe);
  }, [isOpen]);

  // Save settings to Firebase
  const handleToggleLeaderboard = async () => {
    setSaving(true);
    const newValue = !leaderboardEnabled;

    try {
      const settingsRef = ref(rtdb, "adminSettings/leaderboardEnabled");
      await set(settingsRef, newValue);
      setLeaderboardEnabled(newValue);
    } catch (error) {
      console.error("Failed to save admin settings:", error);
      // Revert on error
      setLeaderboardEnabled(!newValue);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[90%] max-w-md border border-gray-700 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Admin Panel</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
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
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FFAA00]"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Leaderboard Toggle */}
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Global Leaderboard</h3>
                  <p className="text-sm text-gray-400">Show leaderboard to all users in all rooms</p>
                </div>
                <button
                  onClick={handleToggleLeaderboard}
                  disabled={saving}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    leaderboardEnabled ? "bg-[#FFAA00]" : "bg-gray-600"
                  } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div
                    className={`absolute top-0.5 h-6 w-6 bg-white rounded-full transition-transform shadow-sm ${
                      leaderboardEnabled ? "translate-x-7" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Additional admin settings can be added here */}
            <div className="text-xs text-gray-500 text-center">Changes take effect immediately for all users</div>
          </div>
        )}
      </div>
    </div>
  );
}
