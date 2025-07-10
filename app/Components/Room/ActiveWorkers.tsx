"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, DataSnapshot } from "firebase/database";

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [userStreaks, setUserStreaks] = useState<Record<string, number>>({});
  const [userDailyTimes, setUserDailyTimes] = useState<Record<string, number>>({});
  const [userDailyTasks, setUserDailyTasks] = useState<Record<string, number>>({});
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [runningTimerData, setRunningTimerData] = useState<Record<string, { startTime: number; baseSeconds: number }>>({});
  const [runningTimers, setRunningTimers] = useState<Record<string, boolean>>({});
  const [currentTime, setCurrentTime] = useState(Date.now());


  // Format time display
  const formatTime = (totalSeconds: number, showSeconds: boolean = false) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      if (showSeconds) {
        return `${hours}h ${minutes}m ${seconds}s`;
      }
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Simple streak calculation (same as PersonalStats) - using UTC time
  const calculateStreak = (dailyCompletions: Record<string, boolean>) => {
    if (!dailyCompletions) return 0;

    const getStreakDate = (timestamp: number = Date.now()) => {
      const date = new Date(timestamp);
      const utcHour = date.getUTCHours();
      if (utcHour < 4) {
        date.setUTCDate(date.getUTCDate() - 1);
      }
      return date.toISOString().split("T")[0];
    };

    let currentStreak = 0;
    const currentStreakDate = getStreakDate();

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date();
      checkDate.setUTCDate(checkDate.getUTCDate() - i);
      if (new Date().getUTCHours() < 4) {
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      }
      const streakDateStr = checkDate.toISOString().split("T")[0];

      if (dailyCompletions[streakDateStr]) {
        currentStreak++;
      } else {
        if (streakDateStr !== currentStreakDate) {
          break;
        }
      }
    }
    return currentStreak;
  };

  useEffect(() => {
    if (!roomId) return;
    const activeRef = ref(rtdb, `instances/${roomId}/activeUsers`);
    const handle = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setActiveUsers(Object.values(data));
      } else {
        setActiveUsers([]);
      }
    });
    return () => off(activeRef, "value", handle);
  }, [roomId]);

  // Load streaks for active users
  useEffect(() => {
    if (activeUsers.length === 0) {
      setUserStreaks({});
      return;
    }

    const handles: Array<() => void> = [];
    const streaks: Record<string, number> = {};

    activeUsers.forEach((user) => {
      // Load streak data
      const dailyCompletionsRef = ref(rtdb, `users/${user.id}/dailyCompletions`);
      const streakHandle = onValue(dailyCompletionsRef, (snapshot) => {
        const dailyCompletions = snapshot.val() || {};
        const currentStreak = calculateStreak(dailyCompletions);
        streaks[user.id] = currentStreak;
        setUserStreaks({ ...streaks });
      });
      handles.push(() => off(dailyCompletionsRef, "value", streakHandle));
    });

    return () => {
      handles.forEach((cleanup) => cleanup());
    };
  }, [activeUsers]);

  // Load daily stats from history for active users
  useEffect(() => {
    if (activeUsers.length === 0) {
      setUserDailyTimes({});
      setUserDailyTasks({});
      return;
    }

    // Get streak date for today (with 4AM UTC cutoff)
    const getStreakDate = (timestamp: number = Date.now()) => {
      const date = new Date(timestamp);
      const utcHour = date.getUTCHours();
      if (utcHour < 4) {
        date.setUTCDate(date.getUTCDate() - 1);
      }
      return date.toISOString().split("T")[0];
    };

    const currentStreakDate = getStreakDate();

    const loadDailyStats = () => {
      // Listen to all instances to calculate daily stats
      const instancesRef = ref(rtdb, "instances");
      onValue(instancesRef, (snapshot) => {
      const instancesData = snapshot.val();
      const dailyTimes: Record<string, number> = {};
      const dailyTasks: Record<string, number> = {};

      // Initialize all active users with 0
      activeUsers.forEach(user => {
        dailyTimes[user.id] = 0;
        dailyTasks[user.id] = 0;
      });

      if (instancesData) {
        // Go through each instance/room
        Object.entries(instancesData).forEach(([, instanceData]) => {
          const typedInstanceData = instanceData as { history?: Record<string, { userId: string; task: string; timestamp?: number; duration?: string }> };
          // Check if there's history data for this instance
          if (typedInstanceData.history) {
            // Go through each history entry in this room
            Object.entries(typedInstanceData.history).forEach(([, entry]) => {
              const typedEntry = entry;
              // Check if this entry belongs to one of our active users
              const activeUser = activeUsers.find(u => u.id === typedEntry.userId);
              if (activeUser && !typedEntry.task.toLowerCase().includes("quit early")) {
                // Check if it's within today's 4am UTC window
                if (typedEntry.timestamp) {
                  const entryStreakDate = getStreakDate(typedEntry.timestamp);

                  if (entryStreakDate === currentStreakDate) {
                    // Parse duration
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
                      dailyTimes[activeUser.id] = (dailyTimes[activeUser.id] || 0) + seconds;
                      dailyTasks[activeUser.id] = (dailyTasks[activeUser.id] || 0) + 1;
                    }
                  }
                }
              }
            });
          }
        });
      }

      setUserDailyTimes(dailyTimes);
      setUserDailyTasks(dailyTasks);
    }, { onlyOnce: true }); // Use onlyOnce to avoid continuous listening
    };

    // Load stats immediately
    loadDailyStats();

    // Set up periodic refresh every 60 seconds
    const interval = setInterval(loadDailyStats, 60000);

    // Also listen to lastEvent to refresh when someone completes a task
    let lastEventRef: ReturnType<typeof ref> | null = null;
    let lastEventHandleFunc: ((snapshot: DataSnapshot) => void) | null = null;
    if (roomId) {
      lastEventRef = ref(rtdb, `instances/${roomId}/lastEvent`);
      let lastEventTimestamp = 0;
      
      lastEventHandleFunc = (snapshot: DataSnapshot) => {
        const event = snapshot.val();
        if (event && event.timestamp > lastEventTimestamp) {
          lastEventTimestamp = event.timestamp;
          // Only refresh on complete events (not start/quit)
          if (event.type === "complete") {
            // Small delay to ensure history is written
            setTimeout(loadDailyStats, 500);
          }
        }
      };
      
      onValue(lastEventRef, lastEventHandleFunc);
    }

    return () => {
      clearInterval(interval);
      if (lastEventRef && lastEventHandleFunc) {
        off(lastEventRef, "value", lastEventHandleFunc);
      }
    };
  }, [activeUsers, roomId]);

  // Listen to user timers to track who's actively running
  useEffect(() => {
    if (!roomId) return;

    const userTimersRef = ref(rtdb, `instances/${roomId}/userTimers`);
    const handle = onValue(userTimersRef, (snapshot) => {
      const timersData = snapshot.val();
      const running: Record<string, boolean> = {};
      const runningData: Record<string, { startTime: number; baseSeconds: number }> = {};
      
      if (timersData) {
        Object.entries(timersData).forEach(([userId, userTimerData]) => {
          const typedTimerData = userTimerData as { 
            running?: boolean; 
            startTime?: number; 
            baseSeconds?: number;
          };
          running[userId] = typedTimerData.running || false;
          
          // Store timer data for running timers
          if (typedTimerData.running && typedTimerData.startTime) {
            runningData[userId] = {
              startTime: typedTimerData.startTime,
              baseSeconds: typedTimerData.baseSeconds || 0
            };
          }
        });
      }
      
      setRunningTimers(running);
      setRunningTimerData(runningData);
    });

    return () => off(userTimersRef, "value", handle);
  }, [roomId]);

  // Calculate the current elapsed time for a running timer
  const getRunningTimerElapsed = (userId: string) => {
    const timerData = runningTimerData[userId];
    if (!timerData) return 0;
    
    const elapsedSinceStart = Math.floor((currentTime - timerData.startTime) / 1000);
    return timerData.baseSeconds + elapsedSinceStart;
  };

  // Update current time every second when hovering over a running timer
  useEffect(() => {
    if (!hoveredUserId || !runningTimers[hoveredUserId]) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hoveredUserId, runningTimers]);

  if (activeUsers.length === 0) return null;

  // Sort users by daily time only (highest first)
  const sortedUsers = [...activeUsers].sort((a, b) => {
    const timeA = userDailyTimes[a.id] || 0;
    const timeB = userDailyTimes[b.id] || 0;
    return timeB - timeA;
  });

  return (
    <div className="fixed top-4 left-8 z-40 text-base font-mono opacity-70 select-none">
      {sortedUsers.map((u, index) => (
        <div
          key={u.id}
          className={`relative text-gray-400 transition-opacity duration-300 flex items-center ${
            flyingUserIds.includes(u.id) ? "opacity-0" : "opacity-100"
          }`}
          style={{ height: "2rem", zIndex: hoveredUserId === u.id ? 50 : 40 - index }}
          onMouseEnter={() => setHoveredUserId(u.id)}
          onMouseLeave={() => setHoveredUserId(null)}
        >
          {(userStreaks[u.id] || 0) > 0 && (
            <div className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 border ${
              userStreaks[u.id] >= 5 ? "border-[#FFAA00]" : "border-gray-400"
            }`}>
              <span className={`text-xs font-bold font-sans ${
                userStreaks[u.id] >= 10 ? "text-[#FFAA00]" : "text-[#9CA3AF]"
              }`}>{userStreaks[u.id]}</span>
            </div>
          )}
          <span className="cursor-pointer">
            {u.displayName}
            {(() => {
              const dailySeconds = userDailyTimes[u.id] || 0;
              const dailyMinutes = Math.floor(dailySeconds / 60);
              const dailyHours = Math.floor(dailySeconds / 3600);
              
              if (dailyMinutes >= 30 && dailyMinutes < 60) {
                return " (0.5h)";
              } else if (dailyHours >= 1) {
                return ` (${dailyHours}h)`;
              }
              return "";
            })()}{" "}
            is <span className="hidden sm:inline">actively </span>working
          </span>
          
          {/* Tooltip */}
          {hoveredUserId === u.id && (
            <div className="absolute top-full left-0 mt-1" style={{ zIndex: 100 }}>
              <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
                <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                  <span className="text-gray-400">Today:</span>{" "}
                  <span className="text-gray-100 font-medium">{userDailyTasks[u.id] || 0}</span>{" "}
                  <span className="text-gray-400">tasks</span> |{" "}
                  <span className="text-gray-100 font-medium">
                    {formatTime(
                      (userDailyTimes[u.id] || 0) + 
                      (runningTimers[u.id] ? getRunningTimerElapsed(u.id) : 0), 
                      true
                    )}
                  </span>
                </div>
                {/* Arrow */}
                <div className="absolute bottom-full left-4 transform border-4 border-transparent border-b-gray-700"></div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
