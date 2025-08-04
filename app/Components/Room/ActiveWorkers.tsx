"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, get } from "firebase/database";
import Image from "next/image";
import { PresenceService } from "@/app/utils/presenceService";

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
  const [firebaseUserNames, setFirebaseUserNames] = useState<Record<string, { firstName: string; lastName: string | null }>>({});

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

  // Create a stable key from user IDs to detect actual changes
  const activeUserIdsKey = React.useMemo(
    () => activeUsers.map(u => u.id).sort().join(','),
    [activeUsers]
  );

  // Fetch user names from Firebase Users instead of API
  useEffect(() => {
    if (activeUsers.length === 0) return;
    
    const fetchFirebaseUsers = async () => {
      const userPromises = activeUsers.map(async (user) => {
        // Skip if we already have this user's data from leaderboard
        if (userInfoMap[user.id]) return null;
        
        try {
          const userRef = ref(rtdb, `Users/${user.id}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const data = snapshot.val();
            return { id: user.id, data };
          }
        } catch (error) {
          console.error(`[ActiveWorkers] Failed to fetch Firebase user ${user.id}:`, error);
        }
        return null;
      });
      
      const results = await Promise.all(userPromises);
      const newUserNames: Record<string, { firstName: string; lastName: string | null }> = {};
      
      results.forEach(result => {
        if (result) {
          newUserNames[result.id] = {
            firstName: result.data.firstName,
            lastName: result.data.lastName
          };
        }
      });
      
      setFirebaseUserNames(prev => ({ ...prev, ...newUserNames }));
    };
    
    fetchFirebaseUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserIdsKey, userInfoMap]);

  // Track previous state to avoid logging on every heartbeat
  const previousStateRef = React.useRef<string>('');
  
  // Listen to room presence using new PresenceService
  useEffect(() => {
    if (!roomId) return;

    const unsubscribe = PresenceService.listenToRoomPresence(roomId, (sessions) => {
      // Separate active and idle users
      const active: { id: string; displayName: string }[] = [];
      const idle: { id: string; displayName: string }[] = [];
      
      // Group sessions by user (handle multiple tabs)
      const userMap = new Map<string, boolean>();
      
      sessions.forEach(session => {
        const currentStatus = userMap.get(session.userId);
        // User is active if ANY of their sessions are active
        userMap.set(session.userId, currentStatus || session.isActive);
      });
      
      // Convert to arrays
      userMap.forEach((isActive, userId) => {
        const userObj = {
          id: userId,
          displayName: "Anonymous" // Will be replaced by Firebase user data
        };
        
        if (isActive) {
          active.push(userObj);
        } else {
          idle.push(userObj);
        }
      });
      
      setActiveUsers(active);
      
      // Only log when there's an actual change in user count or active status
      const activeIds = active.map(u => u.id).sort().join(',');
      const idleIds = idle.map(u => u.id).sort().join(',');
      const currentState = `active:${activeIds}|idle:${idleIds}`;
      
      if (currentState !== previousStateRef.current) {
        console.log('[ActiveWorkers] Active workers:', active.length, active);
        console.log('[ActiveWorkers] Idle workers:', idle.length, idle);
        previousStateRef.current = currentState;
      }
    });
    
    return unsubscribe;
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
            onMouseLeave={(e) => {
              // Check if we're moving to the tooltip
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
                return; // Don't close if moving to child element (tooltip)
              }
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
                // First try from leaderboard data (most up to date)
                const leaderboardUserInfo = userInfoMap[u.id];
                // Then try from Firebase Users
                const firebaseUserInfo = firebaseUserNames[u.id];
                
                let displayValue;
                if (leaderboardUserInfo) {
                  displayValue = `${leaderboardUserInfo.firstName}${leaderboardUserInfo.lastName ? ' ' + leaderboardUserInfo.lastName : ''}`;
                } else if (firebaseUserInfo) {
                  displayValue = `${firebaseUserInfo.firstName}${firebaseUserInfo.lastName ? ' ' + firebaseUserInfo.lastName : ''}`;
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

          {/* Combined Tooltip & Add Contact */}
          {hoveredUserId === u.id && (
            <div 
              className="absolute top-0 left-full" 
              style={{ zIndex: 100 }}
              data-tooltip-for={u.id}
              onMouseEnter={() => setHoveredUserId(u.id)}
              onMouseLeave={() => setHoveredUserId(null)}
            >
              {/* Invisible bridge to maintain hover */}
              <div className="absolute inset-y-0 -left-2 w-4" />
              <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 overflow-hidden w-64 ml-2">
                {/* Stats Section */}
                {userWeeklyStats[u.id] && (
                  <div className="px-4 py-3 border-b border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-2xl font-bold text-white">#{userRankMap[u.id]}</span>
                          <span className="text-xs text-gray-500 font-medium">THIS WEEK</span>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-[#FFAA00] rounded-full"></div>
                            <span className="text-gray-400">Time:</span>
                            <span className="text-white font-medium">{formatTime(userWeeklyStats[u.id].totalDuration)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span className="text-gray-400">Tasks:</span>
                            <span className="text-white font-medium">{userWeeklyStats[u.id].totalTasks}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Add Contact Button */}
                <div className="p-2">
                  <button
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-[#FFAA00] hover:text-[#FFAA00] font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Just UI proof of concept - no action needed
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span className="text-sm">Add Contact</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
