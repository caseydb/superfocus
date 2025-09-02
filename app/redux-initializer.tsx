"use client";

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "./store/store";
import { 
  fetchUserData, 
  updateUser, 
  updateUserData, 
  initializeGuestMode, 
  upgradeToAuthenticatedUser, 
  setGuestWithAuth 
} from "./store/userSlice";
import { fetchTasks, checkForActiveTask, loadFromCache, clearCache } from "./store/taskSlice";
import { fetchPreferences } from "./store/preferenceSlice";
import { fetchHistory } from "./store/historySlice";
import { fetchLeaderboard } from "./store/leaderboardSlice";
import { fetchWorkspace } from "./store/workspaceSlice";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, rtdb } from "@/lib/firebase";
import { ref, set, get, update } from "firebase/database";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasInitialized = useRef(false);
  const hasAttemptedFetch = useRef(false);
  const hasCheckedTimezone = useRef(false);
  const isGuest = useSelector((state: RootState) => state.user.isGuest);
  const reduxUser = useSelector((state: RootState) => state.user);

  useEffect(() => {
    // STEP 1: Initialize as guest immediately (no waiting)
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      dispatch(initializeGuestMode());
      console.log('isGuest: true');
      
      // Load cached tasks for guest users immediately
      dispatch(loadFromCache());
      
      // Sign in anonymously for guest users to enable Firebase features
      signInAnonymously(auth).catch((error) => {
        console.error("Failed to sign in anonymously:", error);
      });
    }

    // STEP 2: Check auth state and try to upgrade if authenticated
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !hasAttemptedFetch.current) {
        // Check if this is an anonymous user
        if (firebaseUser.isAnonymous) {
          // Anonymous user - stay in guest mode but use Firebase features
          console.log('Anonymous Firebase user for guest mode');
          return;
        }
        
        hasAttemptedFetch.current = true;

        // First sync user to PostgreSQL (only for non-anonymous users)
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
            
            // Upgrade to authenticated user
            dispatch(upgradeToAuthenticatedUser({ firebaseUser }));
          }
        } catch {
          // Silent error - will retry with user data fetch
        }

        // Wait a bit to ensure sync completed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to fetch user data
        try {
          const userData = await dispatch(fetchUserData()).unwrap();
          
          // If user data is fetched successfully, we're fully authenticated
          if (userData && userData.user_id) {
            console.log('isLoggedIn');
            
            // Clear any guest data from localStorage
            if (typeof window !== "undefined") {
              localStorage.removeItem("guest_id");
            }
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
            
            // Clear cache and fetch real tasks (replaces any cached guest tasks)
            dispatch(clearCache());
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
        } catch (error) {
          // Auth succeeded but PostgreSQL fetch failed - stay in guest mode with Firebase auth
          console.error("[ReduxInitializer] Failed to fetch user data, staying in guest mode:", error);
          dispatch(setGuestWithAuth({ firebaseUser }));
          
          // Retry once after another delay
          setTimeout(async () => {
            try {
              const userData = await dispatch(fetchUserData()).unwrap();
              
              // If user data is fetched successfully on retry, we're authenticated
              if (userData && userData.user_id) {
                console.log('isLoggedIn');
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
                
                // Clear cache and fetch real tasks (replaces any cached guest tasks)
                dispatch(clearCache());
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
            } catch (retryError) {
              // Even retry failed - stay in guest mode with Firebase auth
              console.error("[ReduxInitializer Retry] Still failed to fetch user data, staying in guest mode:", retryError);
              dispatch(setGuestWithAuth({ firebaseUser }));
            }
          }, 3000);
        }
      } else if (!firebaseUser) {
        // User signed out - reset to guest mode
        hasAttemptedFetch.current = false;
        if (!isGuest) {
          dispatch(initializeGuestMode());
          console.log('isGuest: true');
        }
      }
    });

    return () => unsubscribe();
  }, [dispatch, isGuest]);

  return <>{children}</>;
}
