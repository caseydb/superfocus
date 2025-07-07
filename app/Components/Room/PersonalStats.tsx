"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, set, get } from "firebase/database";

interface HistoryEntry {
  displayName: string;
  task: string;
  duration: string;
  timestamp: number;
  userId?: string;
}

function formatTime(totalSeconds: number) {
  // Handle invalid input
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Format based on duration length
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export default function PersonalStats() {
  const { user } = useInstance();
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState("");

  // Get the "streak date" - which day a timestamp belongs to in the 4am-4am system
  const getStreakDate = (timestamp: number = Date.now()) => {
    const date = new Date(timestamp);
    const hour = date.getHours();

    // If it's before 4am, this counts as the previous day
    if (hour < 4) {
      date.setDate(date.getDate() - 1);
    }

    // Use local date instead of UTC date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  // Calculate streak from daily completions using 4am-4am windows
  const calculateStreak = (dailyCompletions: Record<string, boolean>) => {
    if (!dailyCompletions) return 0;

    let currentStreak = 0;
    const currentStreakDate = getStreakDate(); // Today's streak date
    const streakDates: string[] = [];

    // Start from current streak date and count backwards
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - i);

      // Adjust for 4am boundary - if we're before 4am, we're still in yesterday's streak day
      if (new Date().getHours() < 4) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      const streakDateStr = checkDate.toISOString().split("T")[0];

      if (dailyCompletions[streakDateStr]) {
        currentStreak++;
        streakDates.push(streakDateStr);
      } else {
        // If we haven't reached today yet and there's no completion, break
        // But if it's today and no completion yet, that's ok for the streak
        if (streakDateStr !== currentStreakDate) {
          break;
        }
      }
    }

    // Debug: log the streak dates
    console.log("Streak calculation:", {
      currentStreak,
      currentStreakDate,
      streakDates,
      dailyCompletions,
      currentTime: new Date().toISOString(),
      currentHour: new Date().getHours(),
    });

    return currentStreak;
  };

  // Function to mark today as completed (called when a task is completed)
  const markTodayComplete = async () => {
    if (!user?.id) return;

    const currentStreakDate = getStreakDate(); // Use 4am-4am window
    const dailyCompletionRef = ref(rtdb, `users/${user.id}/dailyCompletions/${currentStreakDate}`);

    // Check if already marked for this streak day
    const snapshot = await get(dailyCompletionRef);
    if (!snapshot.exists()) {
      await set(dailyCompletionRef, true);
    }
  };

  // Calculate time remaining until 4am tomorrow
  const calculateTimeRemaining = () => {
    const now = new Date();
    const tomorrow4am = new Date();

    // Set to 4am tomorrow
    if (now.getHours() >= 4) {
      // After 4am today, so 4am tomorrow
      tomorrow4am.setDate(tomorrow4am.getDate() + 1);
    }
    // Before 4am today, so 4am today
    tomorrow4am.setHours(4, 0, 0, 0);

    const msRemaining = tomorrow4am.getTime() - now.getTime();
    const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((msRemaining % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Load and track daily completions for streak
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const dailyCompletionsRef = ref(rtdb, `users/${user.id}/dailyCompletions`);
    const handle = onValue(dailyCompletionsRef, (snapshot) => {
      const dailyCompletions = snapshot.val() || {};
      const currentStreak = calculateStreak(dailyCompletions);
      setStreak(currentStreak);

      // Check if completed today
      const todayStreakDate = getStreakDate();
      setHasCompletedToday(!!dailyCompletions[todayStreakDate]);
    });

    return () => {
      off(dailyCompletionsRef, "value", handle);
    };
  }, [user?.id]);

  // Update countdown timer every second
  useEffect(() => {
    if (hasCompletedToday) return; // Don't need timer if already completed today

    const updateTimer = () => {
      setTimeRemaining(calculateTimeRemaining());
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval);
  }, [hasCompletedToday]);

  // Expose the markTodayComplete function globally so other components can call it
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as Window & { markStreakComplete?: () => Promise<void> }).markStreakComplete = markTodayComplete;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const userHistoryRef = ref(rtdb, `users/${user.id}/completionHistory`);
    const handle = onValue(userHistoryRef, (snapshot) => {
      const data = snapshot.val();
      let userTasksCompleted = 0;
      let userTotalSeconds = 0;

      if (data) {
        const currentStreakDate = getStreakDate(); // Get today's streak date (4am-4am window)

        Object.values(data as Record<string, HistoryEntry>).forEach((entry) => {
          if (entry.task.toLowerCase().includes("quit early")) return;

          if (entry.timestamp) {
            // Check if this entry is within today's 4am-4am window
            const entryStreakDate = getStreakDate(entry.timestamp);

            if (entryStreakDate === currentStreakDate) {
              // Parse duration more robustly
              let seconds = 0;
              if (entry.duration && typeof entry.duration === "string") {
                const parts = entry.duration.split(":").map(Number);
                if (parts.length === 3) {
                  // hh:mm:ss format
                  const [h, m, s] = parts;
                  if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
                    seconds = h * 3600 + m * 60 + s;
                  }
                } else if (parts.length === 2) {
                  // mm:ss format
                  const [m, s] = parts;
                  if (!isNaN(m) && !isNaN(s)) {
                    seconds = m * 60 + s;
                  }
                }
              }

              // Only process if we got valid seconds
              if (seconds > 0) {
                userTasksCompleted += 1;
                userTotalSeconds += seconds;
              }
            }
          }
        });
      }

      setTasksCompleted(userTasksCompleted);
      setTotalSeconds(userTotalSeconds);
      setLoading(false);
    });

    return () => off(userHistoryRef, "value", handle);
  }, [user?.id]);

  if (loading || !user) return null;

  // Simple consistent styling
  const streakStyle = {
    bg: "bg-gradient-to-br from-[#ffaa00] to-[#e69500]",
  };

  // Show countdown if they haven't completed today's task
  if (!hasCompletedToday) {
    return (
      <div className="fixed top-[16px] right-36 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-5 h-5 ${streakStyle.bg} rounded-full flex items-center justify-center animate-pulse`}>
              <span className="text-black text-xs font-bold">{streak}</span>
            </div>
            <span className="text-gray-400 text-xs font-mono">
              <span className="text-gray-400">day streak</span> |{" "}
              <span className="text-gray-300 font-medium">{timeRemaining}</span> to{" "}
              {streak === 0 ? "start streak!" : "maintain streak!"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Show normal stats if they've completed today's task
  return (
    <div className="fixed top-[16px] right-36 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <div
            className={`w-5 h-5 ${streakStyle.bg} rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110`}
          >
            <span className="text-black text-xs font-bold">{streak}</span>
          </div>
          <span className="text-gray-400 text-xs font-mono">
            <span className="text-gray-400">day streak</span> |{" "}
            <span className="text-gray-300 font-medium">{tasksCompleted}</span> tasks |{" "}
            <span className="text-gray-300 font-medium">{formatTime(totalSeconds)}</span> today
          </span>
        </div>
      </div>
    </div>
  );
}
