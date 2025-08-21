"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "./store/store";
import { fetchUserData, updateUser, updateUserData } from "./store/userSlice";
import { fetchTasks, checkForActiveTask } from "./store/taskSlice";
import { fetchPreferences } from "./store/preferenceSlice";
import { fetchHistory } from "./store/historySlice";
import { fetchLeaderboard } from "./store/leaderboardSlice";
import { fetchWorkspace } from "./store/workspaceSlice";
import { onAuthStateChanged } from "firebase/auth";
import { auth, rtdb } from "@/lib/firebase";
import { ref, set, get, update } from "firebase/database";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasAttemptedFetch = useRef(false);
  const hasCheckedTimezone = useRef(false);

  useEffect(() => {
    // User auth state change listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !hasAttemptedFetch.current) {
        hasAttemptedFetch.current = true;

        // First sync user to PostgreSQL
        try {
          const idToken = await firebaseUser.getIdToken();

          const syncResponse = await fetch("/api/firebase-user-sync", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          });

          if (syncResponse.ok) {
            // Store token for other API calls
            if (typeof window !== "undefined") {
              localStorage.setItem("firebase_token", idToken);
            }
          }
        } catch {
          // Silent error - will retry with user data fetch
        }

        // Wait a bit to ensure sync completed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to fetch user data
        try {
          const userData = await dispatch(fetchUserData()).unwrap();
          
          // If user data is fetched successfully, fetch tasks and preferences from PostgreSQL
          if (userData && userData.user_id) {
            // Initialize Firebase Users for ALL users (even without names)
            try {
              const userRef = ref(rtdb, `Users/${firebaseUser.uid}`);
              const snapshot = await get(userRef);
              if (!snapshot.exists()) {
                // Create Firebase Users entry with whatever data we have
                await set(userRef, {
                  firstName: userData.first_name || '',
                  lastName: userData.last_name || '',
                  picture: userData.profile_image || null,
                  updatedAt: Date.now()
                });
              } else {
                // Update existing entry with latest data (including picture)
                const existingData = snapshot.val();
                const updates: Record<string, string | number | null> = {
                  firstName: userData.first_name || '',
                  lastName: userData.last_name || '',
                  updatedAt: Date.now()
                };
                
                // Update picture if it exists in Redux but not in Firebase, or if it's changed
                if (userData.profile_image && existingData.picture !== userData.profile_image) {
                  updates.picture = userData.profile_image;
                  console.log(`📸 Updating Firebase picture for user ${firebaseUser.uid}`);
                }
                
                await update(userRef, updates);
              }
            } catch (error) {
              console.error("[ReduxInitializer] Failed to initialize Firebase Users:", error);
            }
            
            // Fetch tasks
            await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();

            // Fetch user preferences
            try {
              await dispatch(fetchPreferences(userData.user_id)).unwrap();
            } catch (error) {
              console.error("[ReduxInitializer] Failed to fetch preferences:", error);
            }

            // Fetch workspace data (all rooms)
            try {
              await dispatch(fetchWorkspace()).unwrap();
            } catch (error) {
              console.error("[ReduxInitializer] Failed to fetch workspace:", error);
            }

            // Fetch history and leaderboard if we're on a room page
            if (typeof window !== "undefined") {
              const pathParts = window.location.pathname.split('/');
              const slug = pathParts[pathParts.length - 1];
              if (slug && slug !== '' && !slug.startsWith('_')) {
                try {
                  await dispatch(fetchHistory({ slug })).unwrap();
                } catch (error) {
                  console.error("[ReduxInitializer] Failed to fetch history:", error);
                }
                
                // Fetch room ID and then leaderboard
                try {
                  const roomResponse = await fetch(`/api/room/by-slug?slug=${slug}`);
                  const roomResult = await roomResponse.json();
                  
                  if (roomResult.success && roomResult.room) {
                    await dispatch(fetchLeaderboard('this_week')).unwrap();
                  }
                } catch (error) {
                  console.error("[ReduxInitializer] Failed to fetch leaderboard:", error);
                }
              }
            }

            // Check for any active tasks in Firebase TaskBuffer
            await dispatch(
              checkForActiveTask({
                firebaseUserId: firebaseUser.uid,
                userId: userData.user_id,
              })
            ).unwrap();
            
            // Check if timezone needs updating (only check once)
            if (!hasCheckedTimezone.current) {
              hasCheckedTimezone.current = true;
              const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              
              if (userData.timezone !== localTimezone) {
                // Optimistically update Redux
                dispatch(updateUser({ timezone: localTimezone }));
                
                // Update database
                try {
                  await dispatch(updateUserData({ timezone: localTimezone })).unwrap();
                } catch {
                  // Silent error handling - error details not needed
                }
              }
            }
          }
        } catch {
          // Retry once after another delay
          setTimeout(async () => {
            try {
              const userData = await dispatch(fetchUserData()).unwrap();
              
              // If user data is fetched successfully, fetch tasks and preferences from PostgreSQL
              if (userData && userData.user_id) {
                // Initialize Firebase Users for ALL users (even without names)
                try {
                  const userRef = ref(rtdb, `Users/${firebaseUser.uid}`);
                  const snapshot = await get(userRef);
                  if (!snapshot.exists()) {
                    // Create Firebase Users entry with whatever data we have
                    await set(userRef, {
                      firstName: userData.first_name || '',
                      lastName: userData.last_name || '',
                      picture: userData.profile_image || null,
                      updatedAt: Date.now()
                    });
                  }
                } catch (error) {
                  console.error("[ReduxInitializer Retry] Failed to initialize Firebase Users:", error);
                }
                
                // Fetch tasks
                await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();

                // Fetch user preferences
                try {
                  await dispatch(fetchPreferences(userData.user_id)).unwrap();
                } catch (error) {
                  console.error("[ReduxInitializer] Failed to fetch preferences on retry:", error);
                }

                // Fetch workspace data (all rooms) on retry
                try {
                  await dispatch(fetchWorkspace()).unwrap();
                } catch (error) {
                  console.error("[ReduxInitializer] Failed to fetch workspace on retry:", error);
                }

                // Fetch history and leaderboard if we're on a room page
                if (typeof window !== "undefined") {
                  const pathParts = window.location.pathname.split('/');
                  const slug = pathParts[pathParts.length - 1];
                  if (slug && slug !== '' && !slug.startsWith('_')) {
                    try {
                      await dispatch(fetchHistory({ slug })).unwrap();
                    } catch (error) {
                      console.error("[ReduxInitializer] Failed to fetch history on retry:", error);
                    }
                    
                    // Fetch room ID and then leaderboard
                    try {
                      const roomResponse = await fetch(`/api/room/by-slug?slug=${slug}`);
                      const roomResult = await roomResponse.json();
                      
                      if (roomResult.success && roomResult.room) {
                        await dispatch(fetchLeaderboard('this_week')).unwrap();
                      }
                    } catch (error) {
                      console.error("[ReduxInitializer] Failed to fetch leaderboard on retry:", error);
                    }
                  }
                }

                // Check for any active tasks in Firebase TaskBuffer
                await dispatch(
                  checkForActiveTask({
                    firebaseUserId: firebaseUser.uid,
                    userId: userData.user_id,
                  })
                ).unwrap();
                
                // Check timezone on retry as well
                if (!hasCheckedTimezone.current) {
                  hasCheckedTimezone.current = true;
                  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                  
                  if (userData.timezone !== localTimezone) {
                    // Optimistically update Redux
                    dispatch(updateUser({ timezone: localTimezone }));
                    
                    // Update database
                    try {
                      await dispatch(updateUserData({ timezone: localTimezone })).unwrap();
                    } catch {
                      // Silent error handling - error details not needed
                    }
                  }
                }
              }
            } catch {
              // Silent error handling - error details not needed
            }
          }, 3000);
        }
      } else if (!firebaseUser) {
        // Reset on sign out
        hasAttemptedFetch.current = false;
      }
    });

    return () => unsubscribe();
  }, [dispatch]);

  return <>{children}</>;
}
