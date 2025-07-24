"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useInstance } from "../Instances";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import type { Task } from "../../store/taskSlice";
import { rtdb } from "../../../lib/firebase";
import { ref, set } from "firebase/database";

// Types kept for reference
// interface HistoryEntry {
//   displayName: string;
//   task: string;
//   duration: string;
//   timestamp: number;
//   userId?: string;
// }
//
// interface User {
//   id: string;
//   displayName: string;
//   isPremium: boolean;
// }

// Removed unused interface - kept for reference if needed later

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

// Global state for tracking completed tasks (temporary replacement for Firebase)
const globalCompletedTasks: Array<{
  task: string;
  duration: string;
  timestamp: number;
  userId: string;
}> = [];

// Global function to add completed task
if (typeof window !== "undefined") {
  (
    window as Window & {
      addCompletedTask?: (task: { task: string; duration: string; timestamp: number; userId: string }) => void;
    }
  ).addCompletedTask = (task: { task: string; duration: string; timestamp: number; userId: string }) => {
    globalCompletedTasks.push(task);
    // Trigger re-render by dispatching a custom event
    window.dispatchEvent(new Event("taskCompleted"));
  };
}

export default function PersonalStats() {
  const { user } = useInstance();
  const userTimezone = useSelector((state: RootState) => state.user.timezone);
  const tasks = useSelector((state: RootState) => state.tasks.tasks);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);

  // Get the "streak date" - which day a timestamp belongs to (midnight to midnight)
  const getStreakDate = useCallback(
    (timestamp: number = Date.now()) => {
      const date = new Date(timestamp);

      // Use user's timezone if available, otherwise fall back to local timezone
      const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Get the local time in the user's timezone
      const localTime = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

      // Format as YYYY-MM-DD
      const year = localTime.getFullYear();
      const month = String(localTime.getMonth() + 1).padStart(2, "0");
      const day = String(localTime.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    },
    [userTimezone]
  );

  // Calculate streak from actual task history (matching Analytics exactly)
  // Keep for potential future use
  // const calculateStreakFromHistory = (taskDates: Date[]) => {
  //   if (!taskDates || taskDates.length === 0) return 0;
  //
  //   // Get unique date strings and sort them
  //   const dates = taskDates.map((d) => d.toDateString());
  //   const uniqueDateStrings = Array.from(new Set(dates));
  //   const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  //
  //   let currentStreak = 0;
  //
  //   if (sortedDateStrings.length > 0) {
  //     // Calculate current streak (working backwards from today)
  //     const today = new Date();
  //     today.setHours(0, 0, 0, 0);
  //     const todayStr = today.toDateString();
  //
  //     const yesterday = new Date(today);
  //     yesterday.setDate(yesterday.getDate() - 1);
  //     const yesterdayStr = yesterday.toDateString();
  //
  //     const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];
  //
  //     // Check if the streak is current (task completed today or yesterday)
  //     if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
  //       currentStreak = 1;
  //       let checkDate = new Date(lastTaskDate);
  //
  //       // Work backwards to count consecutive days
  //       for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
  //         const prevDate = new Date(sortedDateStrings[i]);
  //         const expectedDate = new Date(checkDate);
  //         expectedDate.setDate(expectedDate.getDate() - 1);
  //
  //         if (prevDate.toDateString() === expectedDate.toDateString()) {
  //           currentStreak++;
  //           checkDate = expectedDate;
  //         } else {
  //           break;
  //         }
  //       }
  //     }
  //   }
  //
  //   return currentStreak;
  // };

  // Calculate time remaining until midnight local time
  const calculateTimeRemaining = useCallback(() => {
    const now = new Date();
    const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Get current time in user's timezone
    const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

    // Create a date for midnight tonight in user's timezone
    const midnight = new Date(nowInTimezone);
    midnight.setHours(24, 0, 0, 0); // This will automatically roll over to next day at 00:00:00

    // Calculate milliseconds remaining until midnight
    const msRemaining = midnight.getTime() - nowInTimezone.getTime();

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
  }, [userTimezone]);

  // Remove old daily completions tracking - we now calculate from actual task history

  // Update countdown timer every second
  useEffect(() => {
    const updateTimer = () => {
      setTimeRemaining(calculateTimeRemaining());
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval);
  }, [calculateTimeRemaining]);

  // TODO: Replace with Firebase RTDB streak marking
  // Expose the markTodayComplete function globally so other components can call it
  useEffect(() => {
    const markTodayCompleteWrapper = async () => {
      if (!user?.id) return;

      // const currentStreakDate = getStreakDate(); // Use midnight-to-midnight window
      // const dailyCompletionRef = ref(rtdb, `users/${user.id}/dailyCompletions/${currentStreakDate}`);

      // // Check if already marked for this streak day
      // const snapshot = await get(dailyCompletionRef);
      // if (!snapshot.exists()) {
      //   await set(dailyCompletionRef, true);
      // }

      // Temporary: Just set hasCompletedToday
      setHasCompletedToday(true);
    };

    if (typeof window !== "undefined") {
      (window as Window & { markStreakComplete?: () => Promise<void> }).markStreakComplete = markTodayCompleteWrapper;
    }
  }, [user?.id]);

  // TODO: Replace with Firebase RTDB listener for stats
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    // Helper function to convert various date formats to timestamp
    const toTimestamp = (dateValue: string | number | Date): number => {
      if (typeof dateValue === "string") {
        return new Date(dateValue).getTime();
      } else if (typeof dateValue === "number") {
        // Check if it's a future timestamp (likely a mistake)
        const now = Date.now();
        const oneYearFromNow = now + 365 * 24 * 60 * 60 * 1000;
        if (dateValue > oneYearFromNow) {
          // Likely seconds instead of milliseconds
          return dateValue * 1000;
        }
        return dateValue;
      } else if (dateValue instanceof Date) {
        return dateValue.getTime();
      }
      return Date.now();
    };

    // Calculate stats from Redux tasks
    const calculateStats = () => {
      // Filter for completed tasks only
      const completedTasks = tasks.filter((task: Task) => task.status === "completed");

      // Get unique streak dates
      const streakDates = completedTasks.map((t) => {
        const timestamp = toTimestamp(t.completedAt || t.createdAt);
        return getStreakDate(timestamp);
      });
      const uniqueDateStrings = Array.from(new Set(streakDates));
      const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      let currentStreak = 0;

      if (sortedDateStrings.length > 0) {
        // Calculate current streak (working backwards from today)
        const todayStr = getStreakDate(Date.now());
        const yesterdayStr = getStreakDate(Date.now() - 24 * 60 * 60 * 1000);

        const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];

        // Check if the streak is current (task completed today or yesterday)
        if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
          currentStreak = 1;

          // Work backwards to count consecutive days
          for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
            const prevDateStr = sortedDateStrings[i];
            const currDateStr = sortedDateStrings[i + 1];

            // Parse dates and check if they're consecutive
            const prevDate = new Date(prevDateStr);
            const currDate = new Date(currDateStr);
            const diffTime = currDate.getTime() - prevDate.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
              currentStreak++;
            } else {
              break;
            }
          }
        }
      }

      // Calculate today's stats
      const currentStreakDate = getStreakDate();
      const todayTasks = completedTasks.filter((task) => {
        const timestamp = toTimestamp(task.completedAt || task.createdAt);
        const taskStreakDate = getStreakDate(timestamp);
        return taskStreakDate === currentStreakDate;
      });

      const hasCompleted = todayTasks.length > 0;
      setHasCompletedToday(hasCompleted);

      // Calculate today's totals
      const userTaskCount = todayTasks.length;
      const userTotalSeconds = todayTasks.reduce((sum, task) => sum + (task.timeSpent || 0), 0);

      setTasksCompleted(userTaskCount);
      setTotalSeconds(userTotalSeconds);
      setStreak(currentStreak);
      setLoading(false);
    };

    // Calculate stats initially
    calculateStats();

    // Listen for task completion events
    const handleTaskCompleted = () => {
      calculateStats();
    };

    window.addEventListener("taskCompleted", handleTaskCompleted);

    return () => {
      window.removeEventListener("taskCompleted", handleTaskCompleted);
    };
  }, [user?.id, getStreakDate, tasks]);

  // Sync streak to Firebase RTDB whenever it changes
  useEffect(() => {
    if (!user?.id || streak === 0) return;

    // Only sync streaks >= 1 to Firebase
    const syncStreak = async () => {
      try {
        const streakRef = ref(rtdb, `Streaks/${user.id}`);
        await set(streakRef, streak);
      } catch {
        // Silent error handling - error details not needed
      }
    };

    syncStreak();
  }, [streak, user?.id]);

  if (loading || !user) return null;

  // Simple consistent styling
  const streakStyle = {
    bg: "bg-gradient-to-br from-[#ffaa00] to-[#e69500]",
  };

  // Show countdown if they haven't completed today's task
  if (!hasCompletedToday) {
    return (
      <div className="fixed bottom-4 left-0 right-0 sm:top-[13px] sm:right-36 sm:bottom-auto sm:left-auto z-40 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm mx-auto sm:mx-0 w-fit">
          <div className="flex items-center justify-center gap-2">
            <div className={`w-5 h-5 ${streakStyle.bg} rounded-full flex items-center justify-center animate-pulse`}>
              <span className="text-black text-xs font-bold">{streak}</span>
            </div>
            <span className="text-gray-400 text-xs sm:text-base font-mono">
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
    <div className="fixed bottom-4 left-0 right-0 sm:relative sm:top-auto sm:right-auto sm:bottom-auto sm:left-auto z-40 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative">
        <div
          className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm mx-auto sm:mx-0 w-fit cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-5 h-5 ${streakStyle.bg} rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110`}
            >
              <span className="text-black text-xs font-bold">{streak}</span>
            </div>
            <span className="text-gray-400 text-xs sm:text-base font-mono">
              <span className="text-gray-400">day streak</span> |{" "}
              <span className="text-gray-300 font-medium">{tasksCompleted}</span> tasks |{" "}
              <span className="text-gray-300 font-medium">{formatTime(totalSeconds)}</span> today
            </span>
          </div>
        </div>
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 sm:bottom-auto sm:top-full sm:mt-2">
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
              <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                New streak period in: <span className="text-gray-100 font-medium">{timeRemaining}</span>
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 sm:bottom-full sm:top-auto border-4 border-transparent border-t-gray-700 sm:border-t-transparent sm:border-b-gray-700"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
