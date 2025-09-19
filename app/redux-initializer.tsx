"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "./store/store";
import { 
  fetchUserData, 
  updateUser, 
  updateUserData, 
  upgradeToAuthenticatedUser
} from "./store/userSlice";
import { fetchTasks, checkForActiveTask, clearCache, loadFromCache } from "./store/taskSlice";
import { fetchPreferences, hydrateFromCache } from "./store/preferenceSlice";
import { fetchHistory } from "./store/historySlice";
import { fetchLeaderboard } from "./store/leaderboardSlice";
import { fetchWorkspace } from "./store/workspaceSlice";
import { onAuthStateChanged } from "firebase/auth";
import { auth, rtdb } from "@/lib/firebase";
import { ref, set, get, update } from "firebase/database";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasInitialized = useRef(false);
  const hasAttemptedFetch = useRef(false);
  const hasCheckedTimezone = useRef(false);
  const hasLoadedGuestTasks = useRef(false);

  useEffect(() => {
    if (!hasLoadedGuestTasks.current) {
      dispatch(loadFromCache());
      dispatch(hydrateFromCache());
      hasLoadedGuestTasks.current = true;
    }
  }, [dispatch]);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      console.info('[ReduxInitializer] Redux initializer mounted');
    }

    // Check auth state and load authenticated data if available
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || firebaseUser.isAnonymous) {
        if (typeof window !== 'undefined') {
          const hasToken = !!localStorage.getItem('firebase_token');
          if (hasToken) {
            console.warn('[ReduxInitializer] Stale firebase_token found without Firebase user. Clearing token.');
            localStorage.removeItem('firebase_token');
          }
        }
        hasAttemptedFetch.current = false;
        console.info('[ReduxInitializer] Awaiting authenticated Firebase user...');
        return;
      }

      if (!hasAttemptedFetch.current) {
        dispatch(clearCache());
        
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
            
            // Upgrade to authenticated user - extract serializable properties only
            dispatch(upgradeToAuthenticatedUser({ 
              firebaseUser: {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName
              }
            }));
          }
        } catch (e) {
          console.warn('[ReduxInitializer] Sync to Postgres failed; will proceed to fetch user data', e);
        }

        // Wait a bit to ensure sync completed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to fetch user data
        try {
          console.info('[ReduxInitializer] Fetching user data for Firebase user', { uid: firebaseUser.uid });
          const userData = await dispatch(fetchUserData()).unwrap();
          
          // If user data is fetched successfully, we're fully authenticated
          if (userData && userData.user_id) {
            
            // IMPORTANT: Update Firebase auth ID in Redux to match current Firebase user
            // This ensures consistency between Firebase auth and Redux state
            if (userData.auth_id !== firebaseUser.uid) {
              dispatch(updateUser({ auth_id: firebaseUser.uid }));
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
          console.error("[ReduxInitializer] Failed to fetch user data:", error);
          hasAttemptedFetch.current = false;
        }
      }
    });

    return () => unsubscribe();
  }, [dispatch]);

  return <>{children}</>;
}
