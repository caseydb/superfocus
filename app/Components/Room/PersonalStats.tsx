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

interface User {
  id: string;
  displayName: string;
  isPremium: boolean;
}

interface InstanceData {
  history?: Record<string, HistoryEntry>;
  users?: Record<string, User>;
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
  const [showTooltip, setShowTooltip] = useState(false);

  // Get the "streak date" - which day a timestamp belongs to in the 4am UTC system
  const getStreakDate = (timestamp: number = Date.now()) => {
    const date = new Date(timestamp);
    const utcHour = date.getUTCHours();

    // If it's before 4am UTC, this counts as the previous day
    if (utcHour < 4) {
      date.setUTCDate(date.getUTCDate() - 1);
    }

    // Use UTC date for consistency across all users
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  // Calculate streak from actual task history (matching Analytics exactly)
  const calculateStreakFromHistory = (taskDates: Date[]) => {
    if (!taskDates || taskDates.length === 0) return 0;

    // Get unique date strings and sort them
    const dates = taskDates.map(d => d.toDateString());
    const uniqueDateStrings = Array.from(new Set(dates));
    const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    let currentStreak = 0;
    
    if (sortedDateStrings.length > 0) {
      // Calculate current streak (working backwards from today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toDateString();
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      
      const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];
      
      // Check if the streak is current (task completed today or yesterday)
      if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
        currentStreak = 1;
        let checkDate = new Date(lastTaskDate);
        
        // Work backwards to count consecutive days
        for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
          const prevDate = new Date(sortedDateStrings[i]);
          const expectedDate = new Date(checkDate);
          expectedDate.setDate(expectedDate.getDate() - 1);
          
          if (prevDate.toDateString() === expectedDate.toDateString()) {
            currentStreak++;
            checkDate = expectedDate;
          } else {
            break;
          }
        }
      }
    }
    
    return currentStreak;
  };


  // Calculate time remaining until 4am UTC tomorrow
  const calculateTimeRemaining = () => {
    const now = new Date();
    const tomorrow4amUTC = new Date();

    // Set to 4am UTC tomorrow
    if (now.getUTCHours() >= 4) {
      // After 4am UTC today, so 4am UTC tomorrow
      tomorrow4amUTC.setUTCDate(tomorrow4amUTC.getUTCDate() + 1);
    }
    // Before 4am UTC today, so 4am UTC today
    tomorrow4amUTC.setUTCHours(4, 0, 0, 0);

    const msRemaining = tomorrow4amUTC.getTime() - now.getTime();
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

  // Remove old daily completions tracking - we now calculate from actual task history

  // Update countdown timer every second
  useEffect(() => {
    const updateTimer = () => {
      setTimeRemaining(calculateTimeRemaining());
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  // Expose the markTodayComplete function globally so other components can call it
  useEffect(() => {
    const markTodayCompleteWrapper = async () => {
      if (!user?.id) return;

      const currentStreakDate = getStreakDate(); // Use 4am UTC window
      const dailyCompletionRef = ref(rtdb, `users/${user.id}/dailyCompletions/${currentStreakDate}`);

      // Check if already marked for this streak day
      const snapshot = await get(dailyCompletionRef);
      if (!snapshot.exists()) {
        await set(dailyCompletionRef, true);
      }
    };
    
    if (typeof window !== "undefined") {
      (window as Window & { markStreakComplete?: () => Promise<void> }).markStreakComplete = markTodayCompleteWrapper;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    // Listen to all instances to find user's completions across all rooms
    const instancesRef = ref(rtdb, "instances");
    const handle = onValue(instancesRef, (snapshot) => {
      const instancesData = snapshot.val();
      let userTasksCompleted = 0;
      let userTotalSeconds = 0;
      const completedTasks: Array<{
        task: string;
        duration: string;
        timestamp: number;
        seconds: number;
        roomId: string;
      }> = [];
      const roomsWithUserData: string[] = [];
      const allCompletedDates: Date[] = []; // Collect all dates for streak calculation

      if (instancesData) {
        const currentStreakDate = getStreakDate(); // Get today's streak date (4am UTC window)

        // Go through each instance/room
        Object.entries(instancesData).forEach(([instanceId, instanceData]) => {
          const typedInstanceData = instanceData as InstanceData;
          // Check if there's history data for this instance
          if (typedInstanceData.history) {
            let foundUserInRoom = false;

            // Go through each history entry in this room
            Object.entries(typedInstanceData.history).forEach(([, entry]) => {
              const typedEntry = entry as HistoryEntry;
              // Check if this entry belongs to our user
              if (typedEntry.userId === user.id && !typedEntry.task.toLowerCase().includes("quit early")) {
                foundUserInRoom = true;

                if (typedEntry.timestamp) {
                  // Collect date for streak calculation
                  const taskDate = new Date(typedEntry.timestamp);
                  allCompletedDates.push(taskDate);

                  // Check if it's within today's 4am UTC window for today's stats
                  const entryStreakDate = getStreakDate(typedEntry.timestamp);
                  if (entryStreakDate === currentStreakDate) {
                    // Parse duration more robustly
                    let seconds = 0;
                    if (typedEntry.duration && typeof typedEntry.duration === "string") {
                      const parts = typedEntry.duration.split(":").map(Number);
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

                      // Add to completed tasks array for logging
                      completedTasks.push({
                        task: typedEntry.task,
                        duration: typedEntry.duration,
                        timestamp: typedEntry.timestamp,
                        seconds: seconds,
                        roomId: instanceId,
                      });
                    }
                  }
                }
              }
            });

            if (foundUserInRoom) {
              roomsWithUserData.push(instanceId);
            }
          }
        });
      }

      // Calculate streak from actual history
      const calculatedStreak = calculateStreakFromHistory(allCompletedDates);
      setStreak(calculatedStreak);
      
      // Check if completed today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toDateString();
      setHasCompletedToday(allCompletedDates.some(date => date.toDateString() === todayStr));

      setTasksCompleted(userTasksCompleted);
      setTotalSeconds(userTotalSeconds);
      setLoading(false);
    });

    return () => off(instancesRef, "value", handle);
  }, [user?.id]);


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
                New streak period in: <span className="text-gray-100 font-medium">{timeRemaining} (UTC)</span>
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
