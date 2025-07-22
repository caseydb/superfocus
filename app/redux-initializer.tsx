"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "./store/store";
import { fetchUserData, updateUser, updateUserData } from "./store/userSlice";
import { fetchTasks, checkForActiveTask } from "./store/taskSlice";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasAttemptedFetch = useRef(false);
  const hasCheckedTimezone = useRef(false);

  useEffect(() => {
    // Log user's local timezone on page load
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log("[USER_SLICE] User's local timezone:", userTimezone);
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
          console.log("[USER_SLICE] Fetching user data for Firebase user:", firebaseUser.uid);
          const userData = await dispatch(fetchUserData()).unwrap();
          console.log("[USER_SLICE] User data fetched successfully:", userData);
          
          // If user data is fetched successfully, fetch tasks from PostgreSQL
          if (userData && userData.user_id) {
            await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();

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
                console.log("[USER_SLICE] Timezone mismatch detected!");
                console.log("[USER_SLICE] Redux timezone:", userData.timezone);
                console.log("[USER_SLICE] Local timezone:", localTimezone);
                console.log("[USER_SLICE] Updating timezone to:", localTimezone);
                
                // Optimistically update Redux
                dispatch(updateUser({ timezone: localTimezone }));
                
                // Update database
                try {
                  await dispatch(updateUserData({ timezone: localTimezone })).unwrap();
                  console.log("[USER_SLICE] Timezone updated successfully in database");
                } catch (error) {
                  console.error("[USER_SLICE] Failed to update timezone in database:", error);
                }
              } else {
                console.log("[USER_SLICE] Timezone match - no update needed");
              }
            }
          } else {
            console.log("[USER_SLICE] No user_id found in fetched data");
          }
        } catch (error) {
          console.log("[USER_SLICE] Error fetching user data:", error);
          // Retry once after another delay
          setTimeout(async () => {
            try {
              console.log("[USER_SLICE] Retrying user data fetch...");
              const userData = await dispatch(fetchUserData()).unwrap();
              console.log("[USER_SLICE] Retry successful, user data:", userData);
              
              // If user data is fetched successfully, fetch tasks from PostgreSQL
              if (userData && userData.user_id) {
                await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();

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
                    console.log("[USER_SLICE] Timezone mismatch detected on retry!");
                    console.log("[USER_SLICE] Redux timezone:", userData.timezone);
                    console.log("[USER_SLICE] Local timezone:", localTimezone);
                    console.log("[USER_SLICE] Updating timezone to:", localTimezone);
                    
                    // Optimistically update Redux
                    dispatch(updateUser({ timezone: localTimezone }));
                    
                    // Update database
                    try {
                      await dispatch(updateUserData({ timezone: localTimezone })).unwrap();
                      console.log("[USER_SLICE] Timezone updated successfully in database");
                    } catch (error) {
                      console.error("[USER_SLICE] Failed to update timezone in database:", error);
                    }
                  } else {
                    console.log("[USER_SLICE] Timezone match - no update needed");
                  }
                }
              }
            } catch (retryError) {
              console.log("[USER_SLICE] Retry failed:", retryError);
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
