"use client";
import React, { useEffect, useState, useRef } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, get, onValue, off, query, orderByChild, limitToLast } from "firebase/database";
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
  linkedin_url?: string | null;
}

export default function ActiveWorkers({
  roomId,
  roomSlug,
  flyingUserIds = [],
}: {
  roomId: string;
  roomSlug?: string;
  flyingUserIds?: string[];
}) {
  const currentUser = useSelector((state: RootState) => state.user);
  const leaderboardEntries = useSelector((state: RootState) => state.leaderboard.entries);
  const leaderboardTimeFilter = useSelector((state: RootState) => state.leaderboard.timeFilter);
  const leaderboardLastFetched = useSelector((state: RootState) => state.leaderboard.lastFetched);
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
  const isGuestMode = currentUser?.isGuest ?? false;
  
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

  const resolveDisplayName = (firstName?: string | null, lastName?: string | null) => {
    const combined = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    return combined.length > 0 ? combined : "Guest User";
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


  // Fetch weekly leaderboard on demand
  const latestFetchSeq = useRef(0);
  const fetchWeeklyData = React.useCallback(async () => {
    const seq = ++latestFetchSeq.current;
    try {
      const response = await fetch('/api/leaderboard?timeFilter=this_week');
      const data = await response.json();

      if (response.ok && seq === latestFetchSeq.current) {
        setWeeklyLeaderboard(data.data);
      }
    } catch {
      // Failed to fetch weekly leaderboard
    }
  }, []);

  // Initial load of weekly leaderboard (no interval polling)
  useEffect(() => {
    fetchWeeklyData();
  }, [fetchWeeklyData]);

  // Also reflect Redux leaderboard updates when it's for this week
  useEffect(() => {
    if (leaderboardTimeFilter === 'this_week' && leaderboardEntries && leaderboardEntries.length >= 0) {
      // Map Redux entries shape directly; typing matches LeaderboardEntry
      setWeeklyLeaderboard(leaderboardEntries as LeaderboardEntry[]);
      // console.debug('[ActiveWorkers] Updated from Redux leaderboard', { count: leaderboardEntries.length, at: leaderboardLastFetched });
    }
  }, [leaderboardEntries, leaderboardTimeFilter, leaderboardLastFetched]);

  // If Redux refreshed but is showing all_time, still refresh local weekly stats in background
  useEffect(() => {
    if (leaderboardLastFetched && leaderboardTimeFilter !== 'this_week') {
      const t = setTimeout(() => {
        fetchWeeklyData();
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [leaderboardLastFetched, leaderboardTimeFilter, fetchWeeklyData]);

  // Listen to GlobalEffects events and refresh weekly leaderboard on task completion
  useEffect(() => {
    if (isGuestMode) return;
    if (!roomId) return;

    // Only observe recent events
    const eventsQuery = query(
      ref(rtdb, `GlobalEffects/${roomId}/events`),
      orderByChild('timestamp'),
      limitToLast(20)
    );

    let isInitialLoad = true;
    const processed = new Set<string>();
    let debounceTimer: NodeJS.Timeout | null = null;

    const handle = onValue(eventsQuery, (snap) => {
      const events = snap.val();
      if (!events) return;

      if (isInitialLoad) {
        Object.keys(events).forEach((id) => processed.add(id));
        isInitialLoad = false;
        return;
      }

      let shouldRefresh = false;
      Object.entries(events as Record<string, { type?: string }>)
        .forEach(([id, evt]) => {
          if (processed.has(id)) return;
          processed.add(id);
          if (evt?.type === 'complete') {
            shouldRefresh = true;
          }
        });

      if (shouldRefresh) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchWeeklyData();
        }, 5000); // Wait 5s to avoid DB race after completion
      }
    });

    return () => {
      off(eventsQuery, 'value', handle);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [roomId, fetchWeeklyData, isGuestMode]);

  // The leaderboard will now automatically update when tasks are completed
  // via the Redux store updates from CompleteButton.ts

  // Create a stable key from user IDs to detect actual changes
  const activeUserIdsKey = React.useMemo(
    () => activeUsers.map(u => u.id).sort().join(','),
    [activeUsers]
  );

  // Fetch PostgreSQL users for profile images when active users change
  useEffect(() => {
    if (isGuestMode) return;
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
          Object.entries(data.users as Record<string, { firstName: string; lastName: string; profileImage: string | null; linkedinUrl?: string | null }>).forEach(([authId, user]) => {
            newPostgresUsers[authId] = {
              auth_id: authId,
              firstName: user.firstName,
              lastName: user.lastName,
              profile_image: user.profileImage,
              linkedin_url: user.linkedinUrl || null,
            };
          });
          
          setPostgresUsers(prev => ({ ...prev, ...newPostgresUsers }));
        }
      } catch {
        // Failed to fetch PostgreSQL users
      }
    };
    
    fetchPostgresUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserIdsKey, userProfileImages, isGuestMode]);

  // Fetch user names from Firebase Users instead of API
  useEffect(() => {
    if (isGuestMode) return;
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
        } catch {
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
  }, [activeUserIdsKey, userInfoMap, isGuestMode]);

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

  const [slugFirebaseId, setSlugFirebaseId] = useState<string | null>(null);
  const presenceRoomKey = React.useMemo(() => {
    const normalizedSlug = roomSlug ? roomSlug.replace(/^\/+/, "").toLowerCase() : "";
    if (isGuestMode) {
      if (slugFirebaseId) return slugFirebaseId;
      if (normalizedSlug) return normalizedSlug;
    }
    if (roomId) return roomId;
    if (slugFirebaseId) return slugFirebaseId;
    if (normalizedSlug) return normalizedSlug;
    return "";
  }, [roomId, roomSlug, isGuestMode, slugFirebaseId]);

  useEffect(() => {
    if (!isGuestMode) {
      setSlugFirebaseId(null);
      return;
    }

    const normalizedSlug = roomSlug ? roomSlug.replace(/^\/+/, "").toLowerCase() : "";
    if (!normalizedSlug) {
      setSlugFirebaseId(null);
      return;
    }

    const params = new URLSearchParams();
    params.append("firebaseId", normalizedSlug);
    if (roomId) {
      params.append("firebaseId", roomId);
    }

    let cancelled = false;

    const fetchMetadata = async () => {
      try {
        console.log("[ActiveWorkers] Resolving firebaseId for slug", { normalizedSlug, roomId });
        const response = await fetch(`/api/rooms/by-firebase-ids?${params.toString()}`);
        if (!response.ok) {
          console.warn("[ActiveWorkers] Failed to resolve firebaseId", { status: response.status });
          return;
        }
        const data = await response.json();
        const rooms: Record<string, { firebaseId?: string }> = data.rooms || {};
        const normalizedRoomId = roomId ? roomId.replace(/^\/+/, "").toLowerCase() : "";
        const candidates = [normalizedSlug, normalizedRoomId].filter(Boolean);
        for (const candidate of candidates) {
          const match = rooms[candidate];
          if (match?.firebaseId) {
            if (!cancelled) {
              console.log("[ActiveWorkers] Resolved firebaseId", { candidate, firebaseId: match.firebaseId });
              setSlugFirebaseId(match.firebaseId);
            }
            return;
          }
        }
      } catch (error) {
        console.error("[ActiveWorkers] Error resolving firebaseId", error);
      }
    };

    fetchMetadata();

    return () => {
      cancelled = true;
    };
  }, [isGuestMode, roomSlug, roomId]);

  // Listen to room presence using new PresenceService
  useEffect(() => {
    if (isGuestMode) {
      return;
    }
    if (!presenceRoomKey) return;

    previousStateRef.current = "";

    console.log("[ActiveWorkers] Setting up listener", {
      presenceRoomKey,
      roomId,
      roomSlug,
      isGuestMode,
      slugFirebaseId,
    });

    const unsubscribe = PresenceService.listenToRoomPresence(presenceRoomKey, (sessions) => {
      // Process updates immediately - PresenceService already filters out non-meaningful changes

      console.log("[ActiveWorkers] Presence update", {
        presenceRoomKey,
        sessionCount: sessions.length,
        sessionSample: sessions.slice(0, 5),
      });

      const active: { id: string; displayName: string }[] = [];
      const idle: { id: string; displayName: string }[] = [];

      const userMap = new Map<string, boolean>();

      sessions.forEach((session) => {
        const currentStatus = userMap.get(session.userId);
        userMap.set(session.userId, currentStatus || session.isActive);
      });

      userMap.forEach((isActive, userId) => {
        const userObj = {
          id: userId,
          displayName: "Guest User",
        };

        if (isActive) {
          active.push(userObj);
        } else {
          idle.push(userObj);
        }
      });

      const activeIds = active.map((u) => u.id).sort().join(",");
      const idleIds = idle.map((u) => u.id).sort().join(",");
      const currentState = `active:${activeIds}|idle:${idleIds}`;

      if (currentState !== previousStateRef.current) {
        previousStateRef.current = currentState;
        setActiveUsers(active);

        if (isGuestMode) {
          const roomLabel = roomSlug || presenceRoomKey;
          if (active.length > 0) {
            console.log(`Guest view active workers for ${roomLabel}:`, active);
          } else {
            console.log(`Guest view active workers for ${roomLabel}: none active`);
          }
        }
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore cleanup errors
      }

      console.log("[ActiveWorkers] Listener removed", { presenceRoomKey });
    };
  }, [presenceRoomKey, roomId, roomSlug, isGuestMode, slugFirebaseId]);

  useEffect(() => {
    if (!isGuestMode) {
      return;
    }
    if (!presenceRoomKey) {
      return;
    }

    let cancelled = false;
    let timeout: NodeJS.Timeout | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      timeout = setTimeout(fetchPresence, 5000);
    };

    const fetchPresence = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(presenceRoomKey)}/presence`);
        if (!response.ok) {
          console.warn("[ActiveWorkers] Failed to load guest presence", {
            presenceRoomKey,
            status: response.status,
          });
          return;
        }

        const payload: {
          users: Array<{
            id: string;
            isActive: boolean;
            firstName?: string | null;
            lastName?: string | null;
            firebasePicture?: string | null;
            profileImage?: string | null;
            linkedinUrl?: string | null;
          }>;
        } = await response.json();

        if (cancelled || !payload?.users) {
          return;
        }

        const activeUsersFromPayload = payload.users
          .filter((user) => user.isActive)
          .map((user) => ({
            id: user.id,
            displayName: resolveDisplayName(user.firstName, user.lastName),
          }));

        const idleUsersFromPayload = payload.users
          .filter((user) => !user.isActive)
          .map((user) => user.id);

        const stateSignature = `active:${activeUsersFromPayload
          .map((user) => user.id)
          .sort()
          .join(",")}|idle:${idleUsersFromPayload.sort().join(",")}`;

        if (stateSignature !== previousStateRef.current) {
          previousStateRef.current = stateSignature;
          setActiveUsers(activeUsersFromPayload);
        }

        const firebaseUpdates: Record<string, { firstName: string; lastName: string | null; picture?: string | null }> = {};
        const postgresUpdates: Record<string, PostgresUser> = {};

        payload.users.forEach((user) => {
          const firstName = user.firstName ?? "";
          const lastName = user.lastName ?? null;

          firebaseUpdates[user.id] = {
            firstName,
            lastName,
            picture: user.firebasePicture ?? null,
          };

          if (user.profileImage || user.linkedinUrl) {
            postgresUpdates[user.id] = {
              auth_id: user.id,
              firstName,
              lastName: lastName ?? "",
              profile_image: user.profileImage ?? null,
              linkedin_url: user.linkedinUrl ?? null,
            };
          }
        });

        if (Object.keys(firebaseUpdates).length > 0) {
          setFirebaseUserNames((prev) => ({ ...prev, ...firebaseUpdates }));
        }

        if (Object.keys(postgresUpdates).length > 0) {
          setPostgresUsers((prev) => ({ ...prev, ...postgresUpdates }));
        }
      } catch (error) {
        console.error("[ActiveWorkers] Guest presence fetch error", { presenceRoomKey, error });
      } finally {
        scheduleNext();
      }
    };

    fetchPresence();

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isGuestMode, presenceRoomKey]);




  // Sort users by their weekly rank (lowest rank first)
  const sortedUsers = [...activeUsers].sort((a, b) => {
    const rankA = userRankMap[a.id] || 999; // Default to 999 if no rank
    const rankB = userRankMap[b.id] || 999;
    return rankA - rankB;
  });

  const instanceUserId = instanceUser?.id;
  const visibleUsers = React.useMemo(() => {
    if (!isGuestMode || !instanceUserId) {
      return sortedUsers;
    }
    return sortedUsers.filter((user) => user.id !== instanceUserId);
  }, [sortedUsers, isGuestMode, instanceUserId]);

  // Log render details with component ID - removed to reduce console noise

  if (visibleUsers.length === 0) return null;

  return (
    <div className="fixed top-4 left-8 z-40 text-base font-mono opacity-70 select-none sf-active-workers">
      {visibleUsers.map((u, index) => (
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
          <div
            className={`relative mr-2 ${((postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id && currentUser.linkedin_url)) ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => setHoveredUserId(u.id)}
            onClick={() => {
              const url = (postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null);
              if (url) {
                try { window.open(url, '_blank', 'noopener'); } catch {}
              }
            }}
            title={(postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null) ? 'Open LinkedIn profile' : ''}
          >
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
                      className={`rounded-full object-cover border-2 ${hoveredUserId === u.id ? 'border-[#FFAA00]' : 'border-transparent'}`}
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
                    className={`w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-300 border-2 ${
                      hoveredUserId === u.id ? 'border-[#FFAA00]' : 'border-transparent'
                    } ${profileImage ? 'hidden' : 'flex'}`}
                  >
                    {initials}
                  </div>
                </>
              );
            })()}
          </div>
          <span className="flex items-center gap-1.5 group">
            {/* Rank and Name */}
            <span
              className={`font-medium sf-active-name ${hoveredUserId === u.id ? 'text-[#FFAA00]' : 'text-white'} ${(postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id && currentUser.linkedin_url) ? 'cursor-pointer' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const url = (postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null);
                if (url) {
                  try {
                    window.open(url, '_blank', 'noopener');
                  } catch {}
                }
              }}
              title={(postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null) ? 'Open LinkedIn profile' : ''}
            >
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
            <span
              className="flex items-center gap-1 text-gray-400 sf-active-status"
              onMouseEnter={() => setHoveredUserId(u.id)}
              onClick={() => {
                const url = (postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null);
                if (url) {
                  try { window.open(url, '_blank', 'noopener'); } catch {}
                }
              }}
              title={(postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null) ? 'Open LinkedIn profile' : ''}
              style={{ cursor: (postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id && currentUser.linkedin_url) ? 'pointer' : 'default' }}
            >
              <span className="text-xs">is</span>
              <span className="inline-flex items-center gap-1.5 bg-gray-800/50 px-2 py-0.5 rounded-full sf-active-chip">
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
                <span className="text-xs font-medium text-gray-300 sf-active-chip-text"><span className="hidden sm:inline">actively </span>working</span>
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
              <div className="rounded-xl shadow-2xl border overflow-hidden w-64 ml-2 relative sf-card sf-active-tooltip">
                {/* LinkedIn link for hovered user (if available) */}
                {(() => {
                  const url = (postgresUsers[u.id]?.linkedin_url) || (currentUser?.auth_id === u.id ? currentUser.linkedin_url : null);
                  return url ? (
                    <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 text-[#0A66C2] hover:text-[#1385E0]"
                    title="View LinkedIn profile"
                    onClick={(e) => e.stopPropagation()}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                        <rect x="0" y="0" width="24" height="24" rx="5" fill="white" />
                        <path fill="#0077B5" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  ) : null;
                })()}
                {/* Stats Section */}
                <div className="px-4 py-3 border-b border-gray-800/50 sf-active-tooltip-section">
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
