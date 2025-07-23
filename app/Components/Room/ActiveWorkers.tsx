"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, get } from "firebase/database";
import Image from "next/image";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const userTimezone = useSelector((state: RootState) => state.user.timezone);
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [userStreaks, setUserStreaks] = useState<Record<string, number>>({});
  const [userDailyTimes, setUserDailyTimes] = useState<Record<string, number>>({});
  const [userDailyTasks, setUserDailyTasks] = useState<Record<string, number>>({});
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [runningTimerData, setRunningTimerData] = useState<Record<string, { startTime: number; baseSeconds: number }>>(
    {}
  );
  const [runningTimers, setRunningTimers] = useState<Record<string, boolean>>({});
  const [hoveredUserSnapshot, setHoveredUserSnapshot] = useState<{ dailyTime: number; dailyTasks: number } | null>(
    null
  );

  // Format time display
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `0m`;
    }
  };

  // Calculate streak from actual task history (matching Analytics/PersonalStats)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const calculateStreakFromHistory = (completedDates: string[]) => {
    if (!completedDates || completedDates.length === 0) return 0;

    // Get unique dates and sort them
    const uniqueDates = Array.from(new Set(completedDates));
    const sortedDates = uniqueDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Calculate current streak (working backwards from today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toDateString();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const lastTaskDate = new Date(sortedDates[sortedDates.length - 1]).toDateString();

    // Check if the streak is current (task completed today or yesterday)
    if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
      let currentStreak = 1;
      let checkDate = new Date(lastTaskDate);

      // Work backwards to count consecutive days
      for (let i = sortedDates.length - 2; i >= 0; i--) {
        const prevDate = new Date(sortedDates[i]);
        const expectedDate = new Date(checkDate);
        expectedDate.setDate(expectedDate.getDate() - 1);

        if (prevDate.toDateString() === expectedDate.toDateString()) {
          currentStreak++;
          checkDate = expectedDate;
        } else {
          break;
        }
      }

      return currentStreak;
    }

    return 0;
  };

  // Listen to ActiveWorker for users actively running timers
  useEffect(() => {
    if (!roomId) return;
    console.log('[ActiveWorkers] Setting up ActiveWorker listener for room:', roomId);

    // Listen to all ActiveWorker entries
    const activeWorkerRef = ref(rtdb, `ActiveWorker`);
    const handle = onValue(activeWorkerRef, (snapshot) => {
      const data = snapshot.val();
      console.log('[ActiveWorkers] ActiveWorker snapshot received:', {
        hasData: !!data,
        entriesCount: data ? Object.keys(data).length : 0,
        data: data
      });
      
      if (data) {
        console.log('[ActiveWorkers] Processing workers');
        
        // Filter workers in this room who are actively working
        // Never filter based on staleness - if timer is running, they're working
        const workersInRoom = Object.entries(data as Record<string, { roomId: string; isActive: boolean; lastSeen?: number; displayName?: string }>)
          .filter(([userId, worker]) => {
            const isInRoom = worker.roomId === roomId;
            const isActive = worker.isActive;
            
            console.log('[ActiveWorkers] Worker filter check:', {
              userId,
              roomId: worker.roomId,
              isInRoom,
              isActive,
              lastSeen: worker.lastSeen,
              lastSeenDate: worker.lastSeen ? new Date(worker.lastSeen).toISOString() : null,
              willInclude: isInRoom && isActive
            });
            
            // Only check if worker is in this room and active
            // Do NOT filter based on lastSeen age
            return isInRoom && isActive;
          })
          .map(([userId, worker]) => ({
            id: userId,
            displayName: worker.displayName || "Anonymous"
          }));
        
        console.log('[ActiveWorkers] Final active workers:', {
          count: workersInRoom.length,
          users: workersInRoom
        });
        
        setActiveUsers(workersInRoom);
      } else {
        console.log('[ActiveWorkers] No data, setting empty users');
        setActiveUsers([]);
      }
    });
    
    return () => {
      console.log('[ActiveWorkers] Cleaning up ActiveWorker listener');
      off(activeWorkerRef, "value", handle);
    };
  }, [roomId]);

  // Load streaks from Firebase RTDB
  useEffect(() => {
    console.log('[ActiveWorkers] Streak effect triggered, activeUsers:', activeUsers);
    
    if (activeUsers.length === 0) {
      console.log('[ActiveWorkers] No active users, clearing streaks');
      setUserStreaks({});
      return;
    }

    // Set up listeners for each active user's streak
    const unsubscribes: (() => void)[] = [];
    
    activeUsers.forEach((user) => {
      console.log('[ActiveWorkers] Setting up streak listener for user:', user.id);
      const streakRef = ref(rtdb, `Streaks/${user.id}`);
      const unsubscribe = onValue(streakRef, (snapshot) => {
        const streak = snapshot.val();
        console.log('[ActiveWorkers] Streak data for user', user.id, ':', streak);
        
        if (streak && typeof streak === 'number' && streak >= 1) {
          setUserStreaks(prev => {
            const newStreaks = {
              ...prev,
              [user.id]: streak
            };
            console.log('[ActiveWorkers] Updated streaks state:', newStreaks);
            return newStreaks;
          });
        } else {
          // No streak or invalid data
          setUserStreaks(prev => {
            const newStreaks = {
              ...prev,
              [user.id]: 0
            };
            console.log('[ActiveWorkers] Updated streaks state (no streak):', newStreaks);
            return newStreaks;
          });
        }
      });
      
      unsubscribes.push(() => off(streakRef, "value"));
    });

    // Cleanup function
    return () => {
      console.log('[ActiveWorkers] Cleaning up streak listeners');
      unsubscribes.forEach(unsub => unsub());
    };
  }, [activeUsers]);

  // TODO: Replace with Firebase RTDB listener for daily stats
  // Load daily stats from history for active users
  useEffect(() => {
    if (activeUsers.length === 0) {
      setUserDailyTimes({});
      setUserDailyTasks({});
      return;
    }

    // Get streak date for today (with 4AM local time cutoff)
    const getStreakDate = (timestamp: number = Date.now()) => {
      const date = new Date(timestamp);
      
      // Use user's timezone if available, otherwise fall back to local timezone
      const timezone = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Get the local time in the user's timezone
      const localTime = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
      const localHour = localTime.getHours();

      // If it's before 4am local time, this counts as the previous day
      if (localHour < 4) {
        localTime.setDate(localTime.getDate() - 1);
      }

      // Format as YYYY-MM-DD
      const year = localTime.getFullYear();
      const month = String(localTime.getMonth() + 1).padStart(2, "0");
      const day = String(localTime.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const currentStreakDate = getStreakDate();

    const loadDailyStats = () => {
      // TODO: Replace with Firebase RTDB query
      // const instancesRef = ref(rtdb, "instances");
      // onValue(instancesRef, (snapshot) => { ... }, { onlyOnce: true });

      // Temporary: Set empty stats
      const dailyTimes: Record<string, number> = {};
      const dailyTasks: Record<string, number> = {};

      activeUsers.forEach((user) => {
        dailyTimes[user.id] = 0;
        dailyTasks[user.id] = 0;
      });

      setUserDailyTimes(dailyTimes);
      setUserDailyTasks(dailyTasks);
    };

    // Load stats immediately
    loadDailyStats();

    // Set up periodic refresh every 60 seconds
    const interval = setInterval(loadDailyStats, 60000);

    // TODO: Replace with Firebase RTDB listener for lastEvent
    // Also listen to lastEvent to refresh when someone completes a task
    // let lastEventRef: ReturnType<typeof ref> | null = null;
    // let lastEventHandleFunc: ((snapshot: DataSnapshot) => void) | null = null;
    // if (roomId) {
    //   lastEventRef = ref(rtdb, `instances/${roomId}/lastEvent`);
    //   onValue(lastEventRef, lastEventHandleFunc);
    // }

    return () => {
      clearInterval(interval);
      // TODO: Clean up Firebase listeners
      // if (lastEventRef && lastEventHandleFunc) {
      //   off(lastEventRef, "value", lastEventHandleFunc);
      // }
    };
  }, [activeUsers, roomId, userTimezone]);

  // TODO: Replace with Firebase RTDB listener for user timers
  // Listen to user timers to track who's actively running
  useEffect(() => {
    if (!roomId) return;

    // TODO: Replace with Firebase RTDB listener
    // const userTimersRef = ref(rtdb, `instances/${roomId}/userTimers`);
    // const handle = onValue(userTimersRef, (snapshot) => { ... });
    // return () => off(userTimersRef, "value", handle);

    // Temporary: Set empty timers
    setRunningTimers({});
    setRunningTimerData({});
  }, [roomId]);

  // Calculate the current elapsed time for a running timer (only for sorting)
  const getRunningTimerElapsed = (userId: string) => {
    const timerData = runningTimerData[userId];
    if (!timerData) return 0;

    const elapsedSinceStart = Math.floor((Date.now() - timerData.startTime) / 1000);
    return timerData.baseSeconds + elapsedSinceStart;
  };

  if (activeUsers.length === 0) return null;

  // Sort users by daily time only (highest first), including running timers
  const sortedUsers = [...activeUsers].sort((a, b) => {
    const timeA = (userDailyTimes[a.id] || 0) + (runningTimers[a.id] ? getRunningTimerElapsed(a.id) : 0);
    const timeB = (userDailyTimes[b.id] || 0) + (runningTimers[b.id] ? getRunningTimerElapsed(b.id) : 0);
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
          onMouseEnter={() => {
            setHoveredUserId(u.id);
            // Take a snapshot of the current data
            setHoveredUserSnapshot({
              dailyTime: userDailyTimes[u.id] || 0,
              dailyTasks: userDailyTasks[u.id] || 0,
            });
          }}
          onMouseLeave={() => {
            setHoveredUserId(null);
            setHoveredUserSnapshot(null);
          }}
        >
          {(userStreaks[u.id] || 0) > 0 && (
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 ${
                userStreaks[u.id] >= 10
                  ? "bg-gradient-to-br from-[#ffaa00] to-[#e69500]"
                  : `border ${userStreaks[u.id] >= 5 ? "border-[#FFAA00]" : "border-gray-400"}`
              }`}
            >
              <span
                className={`text-xs font-bold font-sans ${
                  userStreaks[u.id] >= 10 ? "text-black" : userStreaks[u.id] >= 5 ? "text-[#FFAA00]" : "text-[#9CA3AF]"
                }`}
              >
                {userStreaks[u.id]}
              </span>
            </div>
          )}
          <span className="cursor-pointer flex items-center gap-1">
            <span>{u.displayName}</span>
            {u.id === "BeAohINmeMfhjrgrhPZlmzVFvzn1" && (
              <Image src="/axe.png" alt="axe" width={16} height={16} className="inline-block" />
            )}
            <span>
              {" "}
              is <span className="hidden sm:inline">actively </span>working
            </span>
          </span>

          {/* Tooltip */}
          {hoveredUserId === u.id && (
            <div className="absolute top-full left-0 mt-1" style={{ zIndex: 100 }}>
              <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
                <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                  <span className="text-gray-400">Today:</span>{" "}
                  <span className="text-gray-100 font-medium">{hoveredUserSnapshot?.dailyTasks || 0}</span>{" "}
                  <span className="text-gray-400">tasks</span> |{" "}
                  <span className="text-gray-100 font-medium">{formatTime(hoveredUserSnapshot?.dailyTime || 0)}</span>
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
