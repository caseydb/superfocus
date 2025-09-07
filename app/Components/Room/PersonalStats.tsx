"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useInstance } from "../Instances";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import type { Task } from "../../store/taskSlice";
// Firebase RTDB removed for streaks; using Redux userSlice instead

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

interface PersonalStatsProps {
  onClick?: () => void;
}

export default function PersonalStats({ onClick }: PersonalStatsProps = {}) {
  const { user } = useInstance();
  const userTimezone = useSelector((state: RootState) => state.user.timezone);
  const tasks = useSelector((state: RootState) => state.tasks.tasks);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const reduxStreak = useSelector((state: RootState) => state.user.streak);
  const [loading, setLoading] = useState(true);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);

  // Get the "streak date" - which day a timestamp belongs to (midnight to midnight)
  const getStreakDate = useCallback(
    (timestamp: number = Date.now()) => {
      // Validate timestamp
      if (!timestamp || isNaN(timestamp)) {
        return "1970-01-01";
      }
      
      const date = new Date(timestamp);
      const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Create a proper date formatter for the timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      // Get the parts
      const parts = formatter.formatToParts(date);
      const dateParts = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);
      
      // Extract values
      const year = dateParts.year;
      const month = dateParts.month;
      const day = dateParts.day;
      
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

  // Removed legacy global bridge for Firebase streak marking

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

      // Unique/sorted streak dates are not needed for current UI; skip computing

      // Current streak now comes from Redux; no local computation needed

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

  // Removed Firebase RTDB streak sync; Redux userSlice handles streak centrally

  if (loading || !user) return null;

  // Streak styling - border only, golden at 2+ days
  const streakBorderColor = reduxStreak >= 2 ? "border-[#FFAA00]" : "border-gray-400";

  // Show countdown if they haven't completed today's task
  if (!hasCompletedToday) {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="relative">
          <div 
            className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm w-fit cursor-pointer hover:border-gray-700/50 transition-colors"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={onClick}
          >
            <div className="flex items-center justify-center gap-2">
              <div className={`w-5 h-5 border ${streakBorderColor} rounded-full flex items-center justify-center animate-pulse bg-transparent`}>
                <span className="text-gray-300 text-xs font-bold">{reduxStreak}</span>
              </div>
              <span className="text-gray-400 text-xs font-mono whitespace-nowrap">
                <span className="text-gray-400">day streak</span> |{" "}
                <span className="text-gray-300 font-medium">{timeRemaining}</span> to{" "}
                {reduxStreak === 0 ? "start streak!" : "maintain streak!"}
              </span>
            </div>
          </div>
          {/* Tooltip */}
          {showTooltip && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2">
              <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
                <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                  Calculated based on your local timezone ({userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone})
                </div>
                {/* Arrow pointing down */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-700"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show normal stats if they've completed today's task
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative">
        <div
          className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm w-fit cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={onClick}
        >
          <div className="flex items-center justify-center gap-2">
            <div
              className={`w-5 h-5 border ${streakBorderColor} rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 bg-transparent`}
            >
              <span className="text-gray-300 text-xs font-bold">{reduxStreak}</span>
            </div>
            <span className="text-gray-400 text-xs font-mono whitespace-nowrap">
              <span className="text-gray-400">day streak</span> |{" "}
              <span className="text-gray-300 font-medium">{tasksCompleted}</span> tasks |{" "}
              <span className="text-gray-300 font-medium">{formatTime(totalSeconds)}</span> today
            </span>
          </div>
        </div>
        {/* Tooltip - always show on hover */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2">
            <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
              <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                New streak period in: <span className="text-gray-100 font-medium">{timeRemaining}</span> ({userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone})
              </div>
              {/* Arrow pointing down */}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-700"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
