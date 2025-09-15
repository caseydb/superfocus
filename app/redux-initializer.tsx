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
  const currentUser = useSelector((state: RootState) => state.user);
  const currentPreferences = useSelector((state: RootState) => state.preferences);

  // Debug: log the entire user slice when it becomes available or changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[Redux] User slice:', currentUser);
    }
  }, [currentUser]);

  // Log preferences slice entirely whenever it changes (debug visibility)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[Redux] Preferences slice:', currentPreferences);
    }
  }, [currentPreferences]);

  useEffect(() => {
    console.log('[ReduxInitializer] Mounting ReduxInitializer');
    // STEP 1: Initialize as guest immediately (no waiting)
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      console.log('[ReduxInitializer] Initializing guest mode & loading cache');
      dispatch(initializeGuestMode());
      
      // Load cached tasks for guest users immediately
      dispatch(loadFromCache());
    }

    // STEP 2: Check auth state and try to upgrade if authenticated
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[ReduxInitializer] onAuthStateChanged fired', {
        hasUser: !!firebaseUser,
        isAnonymous: firebaseUser?.isAnonymous,
        uid: firebaseUser?.uid || null,
      });
      // If no Firebase user, only sign in anonymously if we're not waiting for real auth
      if (!firebaseUser) {
        // Check if there's a pending real auth attempt
        let hasRecentAuthActivity = false;
        if (typeof window !== 'undefined') {
          const pending = sessionStorage.getItem('pendingAuth') === 'true';
          const hasToken = !!localStorage.getItem('firebase_token');
          // If token exists but there is no Firebase user, it's stale. Clear it.
          if (hasToken) {
            console.warn('[ReduxInitializer] Stale firebase_token found without Firebase user. Clearing token.');
            localStorage.removeItem('firebase_token');
          }
          hasRecentAuthActivity = pending;
          console.log('[ReduxInitializer] No firebase user. Flags after cleanup:', {
            pendingAuth: sessionStorage.getItem('pendingAuth'),
            hadStaleToken: hasToken,
          });
        }

        if (!hasRecentAuthActivity) {
          try {
            console.log('[ReduxInitializer] Attempting anonymous sign-in...');
            const cred = await signInAnonymously(auth);
            console.log('[ReduxInitializer] Anonymous sign-in success', { uid: cred.user?.uid });
          } catch (error) {
            console.error("[ReduxInitializer] Failed to sign in anonymously:", error);
          }
        }
        return;
      }
      
      if (firebaseUser && !hasAttemptedFetch.current) {
        console.log('[ReduxInitializer] Firebase user available; attemptedFetch?', hasAttemptedFetch.current);
        // Check if this is an anonymous user
        if (firebaseUser.isAnonymous) {
          console.log('[ReduxInitializer] Anonymous Firebase user detected; staying in guest mode');
          return;
        }
        
        // IMPORTANT: Clear any guest/cached data BEFORE fetching real user data
        if (typeof window !== "undefined") {
          localStorage.removeItem("guest_id");
          localStorage.removeItem("guest_avatar");
        }
        dispatch(clearCache()); // Clear cached tasks immediately
        
        hasAttemptedFetch.current = true;

        // First sync user to PostgreSQL (only for non-anonymous users)
        try {
          const idToken = await firebaseUser.getIdToken();
          console.log('[ReduxInitializer] Got Firebase ID token; syncing user to Postgres');

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
            
            // Upgrade to authenticated user - extract serializable properties only
            dispatch(upgradeToAuthenticatedUser({ 
              firebaseUser: {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName
              }
            }));
            console.log('[ReduxInitializer] Upgraded to authenticated user in Redux');
          }
        } catch (e) {
          console.warn('[ReduxInitializer] Sync to Postgres failed; will proceed to fetch user data', e);
        }

        // Wait a bit to ensure sync completed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to fetch user data
        try {
          const userData = await dispatch(fetchUserData()).unwrap();
          console.log('[ReduxInitializer] fetchUserData result', { hasUserId: !!userData?.user_id });
          
          // If user data is fetched successfully, we're fully authenticated
          if (userData && userData.user_id) {
            
            // IMPORTANT: Update Firebase auth ID in Redux to match current Firebase user
            // This ensures consistency between Firebase auth and Redux state
            if (userData.auth_id !== firebaseUser.uid) {
              dispatch(updateUser({ auth_id: firebaseUser.uid }));
            }
            
            // Clear any remaining guest data from localStorage
            if (typeof window !== "undefined") {
              localStorage.removeItem("guest_id");
              localStorage.removeItem("guest_avatar");
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
                }
                
                await update(userRef, updates);
              }
            } catch (error) {
              console.error("[ReduxInitializer] Failed to initialize Firebase Users:", error);
            }
            
            // Fetch real tasks (cache was already cleared above)
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
          dispatch(setGuestWithAuth({ 
            firebaseUser: {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              isAnonymous: firebaseUser.isAnonymous
            }
          }));
          
          // Retry once after another delay
          setTimeout(async () => {
            try {
              const userData = await dispatch(fetchUserData()).unwrap();
              
              // If user data is fetched successfully on retry, we're authenticated
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
                
                // Fetch real tasks (cache should already be cleared)
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
      } else if (firebaseUser && hasAttemptedFetch.current) {
        // IMPORTANT: Check if this is a page reload scenario where we lost Redux state
        // Check for authenticated Firebase user but guest Redux state
        if (!firebaseUser.isAnonymous && firebaseUser.email && (isGuest || !currentUser.user_id)) {
          hasAttemptedFetch.current = false;
          // Force a re-run of the auth state logic
          // The next onAuthStateChanged call will re-attempt the fetch
        }
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]); // Intentionally excluding isGuest and currentUser.user_id to prevent re-runs

  return <>{children}</>;
}
