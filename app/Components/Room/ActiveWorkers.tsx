"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";
import Image from "next/image";

interface WeeklyLeaderboardEntry {
  user_id: string;
  auth_id: string;
  first_name: string;
  last_name: string;
  profile_image: string | null;
  total_tasks: number;
  total_duration: number;
}

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<WeeklyLeaderboardEntry[]>([]);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, { firstName: string; lastName: string; profileImage: string | null }>>({});

  // Create a mapping of firebase auth UID to rank, stats, and user info from weekly leaderboard
  // Always uses 'this_week' data regardless of main leaderboard filter
  const { userRankMap, userWeeklyStats, userInfoMap } = React.useMemo(() => {
    const rankMap: Record<string, number> = {};
    const statsMap: Record<string, { totalTasks: number; totalDuration: number }> = {};
    const infoMap: Record<string, { firstName: string; lastName: string }> = {};
    
    weeklyLeaderboard.forEach((entry, index) => {
      // Map auth_id to rank (index + 1 for 1-based ranking)
      rankMap[entry.auth_id] = index + 1;
      // Map auth_id to weekly stats
      statsMap[entry.auth_id] = {
        totalTasks: entry.total_tasks,
        totalDuration: entry.total_duration
      };
      // Map auth_id to user info
      infoMap[entry.auth_id] = {
        firstName: entry.first_name,
        lastName: entry.last_name
      };
    });
    
    return { userRankMap: rankMap, userWeeklyStats: statsMap, userInfoMap: infoMap };
  }, [weeklyLeaderboard]);

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


  // Fetch weekly leaderboard data
  const fetchWeeklyLeaderboard = React.useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard?timeFilter=this_week');
      const data = await response.json();
      if (data.success) {
        setWeeklyLeaderboard(data.data);
      }
    } catch (error) {
      console.error('[ActiveWorkers] Failed to fetch weekly leaderboard:', error);
    }
  }, []);

  // Initial fetch of weekly leaderboard
  useEffect(() => {
    fetchWeeklyLeaderboard();
  }, [fetchWeeklyLeaderboard]);

  // Listen for history updates (which means someone completed a task) and refresh weekly leaderboard
  useEffect(() => {
    if (!roomId) return;

    const historyUpdateRef = ref(rtdb, `rooms/${roomId}/historyUpdate`);
    let lastTimestamp = 0;
    
    const handle = onValue(historyUpdateRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.timestamp) {
        // Only fetch if this is a new update (not the same timestamp we already processed)
        if (data.timestamp > lastTimestamp && Date.now() - data.timestamp < 10000) {
          lastTimestamp = data.timestamp;
          // Refresh weekly leaderboard when someone completes a task
          fetchWeeklyLeaderboard();
        }
      }
    });

    return () => off(historyUpdateRef, "value", handle);
  }, [roomId, fetchWeeklyLeaderboard]);

  // Fetch user names when active users change
  useEffect(() => {
    if (activeUsers.length === 0) return;
    
    const authIds = activeUsers.map(u => u.id);
    
    fetch('/api/users/by-auth-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authIds })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUserNames(data.users);
        }
      })
      .catch(error => {
        console.error('[ActiveWorkers] Failed to fetch user names:', error);
      });
  }, [activeUsers]);

  // Listen to ActiveWorker for users actively running timers
  useEffect(() => {
    if (!roomId) return;

    // Listen to all ActiveWorker entries
    const activeWorkerRef = ref(rtdb, `ActiveWorker`);
    const handle = onValue(activeWorkerRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        // Filter workers in this room who are actively working
        const workersInRoom = Object.entries(data as Record<string, { roomId?: string; isActive?: boolean; lastSeen?: number; displayName?: string }>)
          .filter(([, worker]) => {
            // Check if this worker is in our room and is active
            return worker.roomId === roomId && worker.isActive === true;
          })
          .map(([userId, worker]) => ({
            id: userId,
            displayName: worker.displayName || "Anonymous"
          }));
        
        setActiveUsers(workersInRoom);
      } else {
        setActiveUsers([]);
      }
    });
    
    return () => {
      off(activeWorkerRef, "value", handle);
    };
  }, [roomId]);




  if (activeUsers.length === 0) return null;

  // Sort users by their weekly rank (lowest rank first)
  const sortedUsers = [...activeUsers].sort((a, b) => {
    const rankA = userRankMap[a.id] || 999; // Default to 999 if no rank
    const rankB = userRankMap[b.id] || 999;
    return rankA - rankB;
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
            }}
            onMouseLeave={() => {
              setHoveredUserId(null);
            }}
          >
          {userRankMap[u.id] && (
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center mr-2 border ${
                userRankMap[u.id] <= 5 ? "border-[#FFAA00]" : "border-gray-400"
              }`}
            >
              <span
                className="text-xs font-bold font-sans text-[#9CA3AF]"
              >
                {userRankMap[u.id]}
              </span>
            </div>
          )}
          <span className="cursor-pointer flex items-center gap-1">
            <span>
              {(() => {
                // First try to get from our fetched user names
                const fetchedUserInfo = userNames[u.id];
                // Then try from leaderboard data
                const leaderboardUserInfo = userInfoMap[u.id];
                
                let displayValue;
                if (fetchedUserInfo) {
                  displayValue = `${fetchedUserInfo.firstName}${fetchedUserInfo.lastName ? ' ' + fetchedUserInfo.lastName : ''}`;
                } else if (leaderboardUserInfo) {
                  displayValue = `${leaderboardUserInfo.firstName}${leaderboardUserInfo.lastName ? ' ' + leaderboardUserInfo.lastName : ''}`;
                } else {
                  displayValue = u.displayName;
                }
                
                return displayValue;
              })()}
            </span>
            {u.id === "BeAohINmeMfhjrgrhPZlmzVFvzn1" && (
              <Image src="/axe.png" alt="axe" width={16} height={16} className="inline-block" />
            )}
            <span>
              {" "}
              is <span className="hidden sm:inline">actively </span>working
            </span>
          </span>

          {/* Tooltip */}
          {hoveredUserId === u.id && userWeeklyStats[u.id] && (
            <div className="absolute top-full left-0 mt-1" style={{ zIndex: 100 }}>
              <div className="bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 shadow-lg">
                <div className="text-gray-300 text-xs font-mono whitespace-nowrap">
                  <span className="text-gray-400">Rank</span>{" "}
                  <span className="text-gray-100 font-medium">{userRankMap[u.id]}</span>{" "}
                  <span className="text-gray-400">this week:</span>{" "}
                  <span className="text-gray-100 font-medium">{formatTime(userWeeklyStats[u.id].totalDuration)}</span> |{" "}
                  <span className="text-gray-100 font-medium">{userWeeklyStats[u.id].totalTasks}</span>{" "}
                  <span className="text-gray-400">tasks</span>
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
