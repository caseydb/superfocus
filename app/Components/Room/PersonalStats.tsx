"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { rtdb, auth } from "../../../lib/firebase";
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

  // Calculate streak from daily completions using 4am UTC windows
  const calculateStreak = (dailyCompletions: Record<string, boolean>) => {
    if (!dailyCompletions) return 0;

    let currentStreak = 0;
    const currentStreakDate = getStreakDate(); // Today's streak date in UTC

    // Start from current streak date and count backwards
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date();
      checkDate.setUTCDate(checkDate.getUTCDate() - i);

      // Adjust for 4am UTC boundary
      if (new Date().getUTCHours() < 4) {
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      }

      const streakDateStr = checkDate.toISOString().split("T")[0];

      if (dailyCompletions[streakDateStr]) {
        currentStreak++;
      } else {
        // If we haven't reached today yet and there's no completion, break
        // But if it's today and no completion yet, that's ok for the streak
        if (streakDateStr !== currentStreakDate) {
          break;
        }
      }
    }

    return currentStreak;
  };

  // Function to mark today as completed (called when a task is completed)
  const markTodayComplete = async () => {
    if (!user?.id) return;

    const currentStreakDate = getStreakDate(); // Use 4am UTC window
    const dailyCompletionRef = ref(rtdb, `users/${user.id}/dailyCompletions/${currentStreakDate}`);

    // Check if already marked for this streak day
    const snapshot = await get(dailyCompletionRef);
    if (!snapshot.exists()) {
      await set(dailyCompletionRef, true);
    }
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

                // Check if it's within today's 4am UTC window
                if (typedEntry.timestamp) {
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

      // Console log all tasks completed in today's 4am UTC window
      console.log(`=== ${user.displayName || user.id} - Tasks Completed Today (4am UTC, Cross-Room) ===`);
      console.log(`User ID: ${user.id}`);
      console.log(`Display Name: ${user.displayName}`);
      console.log(
        `Is Firebase Auth User: ${user.id.startsWith("user-") ? "NO (session-based)" : "YES (Firebase UID)"}`
      );
      console.log(`Current Firebase Auth User:`, auth.currentUser?.uid || "Not signed in");
      console.log(`Data Source: Scanning all instances/rooms for user completions`);
      console.log(`Rooms with user data: ${roomsWithUserData.length} rooms`);
      console.log(`Room IDs: ${roomsWithUserData.join(", ")}`);
      console.log(`Total Tasks: ${userTasksCompleted}`);
      console.log(`Total Time: ${formatTime(userTotalSeconds)} (${userTotalSeconds} seconds)`);
      console.log(
        `Individual Tasks:`,
        completedTasks.map((task) => ({
          task: task.task,
          duration: task.duration,
          timestamp: new Date(task.timestamp).toLocaleString(),
          seconds: task.seconds,
          roomId: task.roomId,
        }))
      );
      console.log(`=== End of ${user.displayName || user.id} Cross-Room Task Summary ===`);

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
      <div className="fixed bottom-4 left-0 right-0 sm:top-4 sm:right-36 sm:bottom-auto sm:left-auto z-40 animate-in fade-in slide-in-from-top-2 duration-300">
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
    <div className="fixed bottom-4 left-0 right-0 sm:top-4 sm:right-36 sm:bottom-auto sm:left-auto z-40 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="bg-gray-900/45 backdrop-blur-sm rounded-full px-2 py-0.5 border border-gray-800/30 shadow-sm mx-auto sm:mx-0 w-fit">
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
    </div>
  );
}
