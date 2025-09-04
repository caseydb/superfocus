"use client";
import React, { useEffect, useState, useRef } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, get } from "firebase/database";
import Image from "next/image";
import { PresenceService } from "@/app/utils/presenceService";
import GlobalPulseTicker from "@/app/utils/globalPulseTicker";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store/store";
import { useInstance } from "../Instances";
import { LeaderboardEntry } from "@/app/store/leaderboardSlice";

interface PostgresUser {
  auth_id: string;
  firstName: string;
  lastName: string;
  profile_image: string | null;
}

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const currentUser = useSelector((state: RootState) => state.user);
  const { user: instanceUser } = useInstance();
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);
  // Store weekly leaderboard data separately from the global filter
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  const [firebaseUserNames, setFirebaseUserNames] = useState<Record<string, { firstName: string; lastName: string | null; picture?: string | null }>>({});
  const [postgresUsers, setPostgresUsers] = useState<Record<string, PostgresUser>>({});
  const [globalDotOpacity, setGlobalDotOpacity] = useState(1);
  const [syncedUsers, setSyncedUsers] = useState<Set<string>>(new Set());
  const [guestAvatars, setGuestAvatars] = useState<Record<string, string>>({});
  
  // Subscribe to the global singleton pulse ticker
  useEffect(() => {
    const ticker = GlobalPulseTicker.getInstance();
    const unsubscribe = ticker.subscribe((opacity) => {
      setGlobalDotOpacity(opacity);
    });
    
    return () => {
      unsubscribe();
    };
  }, []); // Empty deps - subscribe once on mount
  
  // Track if we're in sync window to avoid multiple syncs
  const inSyncWindowRef = useRef(false);
  
  // Watch for start of pulse cycle to sync waiting users
  useEffect(() => {
    // Clean up synced users who are no longer active
    const activeUserIds = new Set(activeUsers.map(u => u.id));
    setSyncedUsers(prev => {
      const updated = new Set<string>();
      prev.forEach(id => {
        if (activeUserIds.has(id)) {
          updated.add(id);
        }
      });
      return updated;
    });
  }, [activeUsers]);
  
  // Use the global ticker to detect cycle starts
  useEffect(() => {
    const now = Date.now();
    const cyclePosition = (now % 2000) / 2000;
    
    // Check if we're in the sync window (first 5% of cycle)
    const isInSyncWindow = cyclePosition < 0.05;
    
    // Detect when we enter the sync window
    if (isInSyncWindow && !inSyncWindowRef.current) {
      inSyncWindowRef.current = true;
      
      // Sync any unsynced users
      const allUserIds = new Set(activeUsers.map(u => u.id));
      const unsyncedUsers = Array.from(allUserIds).filter(id => !syncedUsers.has(id));
      
      if (unsyncedUsers.length > 0) {
        setSyncedUsers(allUserIds);
      }
    } else if (!isInSyncWindow && inSyncWindowRef.current) {
      // We've left the sync window
      inSyncWindowRef.current = false;
    }
  }, [globalDotOpacity, activeUsers, syncedUsers]); // Check on every opacity update
  

  // Create a mapping of firebase auth UID to rank, stats, and user info from weekly leaderboard
  // Now uses Redux state which is always in sync with the main Leaderboard component
  const { userRankMap, userWeeklyStats, userInfoMap, userProfileImages } = React.useMemo(() => {
    const rankMap: Record<string, number> = {};
    const statsMap: Record<string, { totalTasks: number; totalDuration: number }> = {};
    const infoMap: Record<string, { firstName: string; lastName: string }> = {};
    const profileImages: Record<string, string | null> = {};
    
    // Cast to LeaderboardEntry[] for type safety
    const typedLeaderboard = weeklyLeaderboard as LeaderboardEntry[];
    
    typedLeaderboard.forEach((entry, index) => {
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
      // Map auth_id to profile image
      profileImages[entry.auth_id] = entry.profile_image;
    });
    
    return { userRankMap: rankMap, userWeeklyStats: statsMap, userInfoMap: infoMap, userProfileImages: profileImages };
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

  // Get ordinal suffix for rank - commented out for now
  // const getOrdinalSuffix = (rank: number): string => {
  //   const j = rank % 10;
  //   const k = rank % 100;
  //   
  //   if (j === 1 && k !== 11) {
  //     return rank + "st";
  //   }
  //   if (j === 2 && k !== 12) {
  //     return rank + "nd";
  //   }
  //   if (j === 3 && k !== 13) {
  //     return rank + "rd";
  //   }
  //   return rank + "th";
  // };


  // Fetch weekly leaderboard data independently
  // ActiveWorkers always needs weekly data, regardless of what the Leaderboard component is showing
  useEffect(() => {
    const fetchWeeklyData = async () => {
      try {
        const response = await fetch('/api/leaderboard?timeFilter=this_week');
        const data = await response.json();
        
        if (response.ok) {
          setWeeklyLeaderboard(data.data);
        }
      } catch (error) {
        // Failed to fetch weekly leaderboard
      }
    };
    
    // Fetch on mount and periodically
    fetchWeeklyData();
    const interval = setInterval(fetchWeeklyData, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // The leaderboard will now automatically update when tasks are completed
  // via the Redux store updates from CompleteButton.ts

  // Create a stable key from user IDs to detect actual changes
  const activeUserIdsKey = React.useMemo(
    () => activeUsers.map(u => u.id).sort().join(','),
    [activeUsers]
  );

  // Fetch PostgreSQL users for profile images when active users change
  useEffect(() => {
    if (activeUsers.length === 0) return;
    
    const fetchPostgresUsers = async () => {
      // Filter users not already in userProfileImages from leaderboard
      const usersToFetch = activeUsers.filter(u => !userProfileImages[u.id]);
      
      if (usersToFetch.length === 0) return;
      
      try {
        const authIds = usersToFetch.map(u => u.id);
        const response = await fetch('/api/users/by-auth-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authIds })
        });
        
        if (response.ok) {
          const data = await response.json();
          const newPostgresUsers: Record<string, PostgresUser> = {};
          
          // data.users is an object/map, not an array
          Object.entries(data.users as Record<string, { firstName: string; lastName: string; profileImage: string | null }>).forEach(([authId, user]) => {
            newPostgresUsers[authId] = {
              auth_id: authId,
              firstName: user.firstName,
              lastName: user.lastName,
              profile_image: user.profileImage
            };
          });
          
          setPostgresUsers(prev => ({ ...prev, ...newPostgresUsers }));
        }
      } catch (error) {
        // Failed to fetch PostgreSQL users
      }
    };
    
    fetchPostgresUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserIdsKey, userProfileImages]);

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
          // Failed to fetch Firebase user
        }
        return null;
      });
      
      const results = await Promise.all(userPromises);
      const newUserNames: Record<string, { firstName: string; lastName: string | null; picture?: string | null }> = {};
      
      results.forEach(result => {
        if (result) {
          newUserNames[result.id] = {
            firstName: result.data.firstName,
            lastName: result.data.lastName,
            picture: result.data.picture || null
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
  
  // Assign random animal avatars to guest users (but not for current user)
  useEffect(() => {
    const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
    const newGuestAvatars: Record<string, string> = {};
    
    activeUsers.forEach(user => {
      // Check if this user is a guest:
      // 1. No data in PostgreSQL (leaderboard or direct fetch)
      // 2. Firebase data shows empty/Guest name OR no Firebase data at all
      // 3. No existing profile picture
      const hasPostgresData = userInfoMap[user.id] || postgresUsers[user.id];
      const firebaseData = firebaseUserNames[user.id];
      const hasRealName = firebaseData && firebaseData.firstName && 
                          firebaseData.firstName !== '' && 
                          firebaseData.firstName !== 'Guest';
      const hasProfilePicture = firebaseData?.picture || 
                                userProfileImages[user.id] || 
                                postgresUsers[user.id]?.profile_image;
      
      // Only assign animal avatar if they're truly a guest without any real data
      const isGuestUser = !hasPostgresData && !hasRealName && !hasProfilePicture;
      
      if (isGuestUser && !guestAvatars[user.id]) {
        // Assign random animal avatar for guest users
        const randomAnimal = animals[Math.floor(Math.random() * animals.length)];
        newGuestAvatars[user.id] = `/${randomAnimal}.png`;
      }
    });
    
    if (Object.keys(newGuestAvatars).length > 0) {
      setGuestAvatars(prev => ({ ...prev, ...newGuestAvatars }));
    }
  }, [activeUsers, userInfoMap, postgresUsers, firebaseUserNames, guestAvatars, userProfileImages]);

  // Listen to room presence using new PresenceService
  useEffect(() => {
    if (!roomId) return;

    
    let lastUpdateTime = 0;
    const UPDATE_THROTTLE_MS = 1000; // Only process updates every 1 second

    const unsubscribe = PresenceService.listenToRoomPresence(roomId, (sessions) => {
      // Throttle updates to prevent excessive processing
      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_THROTTLE_MS) {
        return; // Skip this update, too soon
      }
      lastUpdateTime = now;
      
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
          displayName: "Guest User" // Will be replaced by Firebase user data
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
        previousStateRef.current = currentState;
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [roomId]);




  // Sort users by their weekly rank (lowest rank first)
  const sortedUsers = [...activeUsers].sort((a, b) => {
    const rankA = userRankMap[a.id] || 999; // Default to 999 if no rank
    const rankB = userRankMap[b.id] || 999;
    return rankA - rankB;
  });

  // Log render details with component ID - removed to reduce console noise

  if (activeUsers.length === 0) return null;

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
              const relatedTarget = e.relatedTarget;
              // Only check contains if relatedTarget is a valid Node
              if (relatedTarget && relatedTarget instanceof Node && e.currentTarget.contains(relatedTarget)) {
                return; // Don't close if moving to child element (tooltip)
              }
              setHoveredUserId(null);
            }}
          >
          {/* Profile picture */}
          <div className="relative mr-2">
            {(() => {
              // Check if this is the current user
              // Instance user.id will be Firebase UID once auth completes
              const isCurrentUser = instanceUser && u.id === instanceUser.id;
              
              // Priority order for profile images:
              // 1. If current user, use Redux avatar (for guests, this is their persistent animal)
              // 2. Real profile images from PostgreSQL (for authenticated users)
              // 3. Guest animal avatars (randomly assigned for other guests)
              
              let profileImage;
              if (isCurrentUser) {
                // This is me - use my Redux avatar
                profileImage = currentUser.profile_image;
              } else {
                // Someone else - use their real image or random animal
                profileImage = userProfileImages[u.id] || 
                              postgresUsers[u.id]?.profile_image ||
                              firebaseUserNames[u.id]?.picture ||
                              guestAvatars[u.id];
              }
              
              // Process Google profile image URLs to ensure consistent size
              if (profileImage && profileImage.includes('googleusercontent.com')) {
                // Remove any existing size parameter and add our own
                profileImage = profileImage.replace(/=s\d+-c/, '=s200-c');
                // If no size parameter exists, add one
                if (!profileImage.includes('=s')) {
                  profileImage += '=s200-c';
                }
              }
              
              const userInfo = userInfoMap[u.id] || firebaseUserNames[u.id] || postgresUsers[u.id];
              const firstName = userInfo?.firstName || u.displayName.split(' ')[0] || 'Guest';
              const lastName = userInfo?.lastName || (userInfo ? '' : 'User');
              const initials = (firstName.charAt(0) + (lastName ? lastName.charAt(0) : '')).toUpperCase();
              
              return (
                <>
                  {profileImage ? (
                    <Image 
                      src={profileImage} 
                      alt="Profile" 
                      width={28}
                      height={28}
                      className="rounded-full object-cover"
                      style={{ width: '28px', height: '28px' }}
                      unoptimized={true}
                      onError={(e) => {
                        // Silently handle error - Google images fail on localhost due to CORS
                        // Hide this image and show fallback
                        const imgElement = e.currentTarget as HTMLImageElement;
                        imgElement.style.display = 'none';
                        const fallback = imgElement.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                      onLoad={() => {
                      }}
                    />
                  ) : null}
                  <div 
                    className={`w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-300 ${
                      profileImage ? 'hidden' : 'flex'
                    }`}
                  >
                    {initials}
                  </div>
                </>
              );
            })()}
          </div>
          <span className="cursor-pointer flex items-center gap-1.5 group">
            {/* Rank and Name */}
            <span className="font-medium text-white">
              {(() => {
                // const rank = userRankMap[u.id]; // Commented out - not used currently
                // First try from leaderboard data (most up to date)
                const leaderboardUserInfo = userInfoMap[u.id];
                // Then try from Firebase Users
                const firebaseUserInfo = firebaseUserNames[u.id];
                // Then try from PostgreSQL
                const postgresUserInfo = postgresUsers[u.id];
                
                let displayName;
                if (leaderboardUserInfo) {
                  displayName = `${leaderboardUserInfo.firstName}${leaderboardUserInfo.lastName ? ' ' + leaderboardUserInfo.lastName : ''}`;
                } else if (postgresUserInfo) {
                  displayName = `${postgresUserInfo.firstName}${postgresUserInfo.lastName ? ' ' + postgresUserInfo.lastName : ''}`;
                } else if (firebaseUserInfo) {
                  displayName = `${firebaseUserInfo.firstName}${firebaseUserInfo.lastName ? ' ' + firebaseUserInfo.lastName : ''}`;
                } else {
                  displayName = u.displayName;
                }
                
                // Show name without rank prefix
                return displayName;
              })()}
            </span>
            
            {/* Special badge */}
            {u.id === "BeAohINmeMfhjrgrhPZlmzVFvzn1" && (
              <Image src="/axe.png" alt="axe" width={16} height={16} className="inline-block" />
            )}
            
            {/* Status text with pulsing dot - temporarily hidden */}
            <span className="flex items-center gap-1 text-gray-400">
              <span className="text-xs">is</span>
              <span className="inline-flex items-center gap-1.5 bg-gray-800/50 px-2 py-0.5 rounded-full">
                {/* Pulsing dot temporarily commented out
                <div className="relative flex items-center justify-center">
                  <div 
                    className="w-2 h-2 bg-green-500 rounded-full transition-opacity duration-100"
                    style={{ opacity: syncedUsers.has(u.id) ? globalDotOpacity : 1 }}
                  ></div>
                  {syncedUsers.has(u.id) && (
                    <div className="absolute w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                  )}
                </div>
                */}
                <span className="text-xs font-medium text-gray-300"><span className="hidden sm:inline">actively </span>working</span>
              </span>
            </span>
          </span>

          {/* Tooltip with Stats */}
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
                <div className="px-4 py-3 border-b border-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      {userWeeklyStats[u.id] ? (
                        <>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-2xl font-bold text-white">#{userRankMap[u.id]}</span>
                            <span className="text-xs text-gray-500 font-medium">THIS WEEK</span>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                              <span className="text-gray-400">Time:</span>
                              <span className="text-white font-medium">{formatTime(userWeeklyStats[u.id].totalDuration)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                              <span className="text-gray-400">Tasks:</span>
                              <span className="text-white font-medium">{userWeeklyStats[u.id].totalTasks}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-xl font-bold text-gray-500">Unranked</span>
                            <span className="text-xs text-gray-500 font-medium">THIS WEEK</span>
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                              <span className="text-gray-400">Time:</span>
                              <span className="text-gray-500 font-medium">0h 0m</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                              <span className="text-gray-400">Tasks:</span>
                              <span className="text-gray-500 font-medium">0</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
