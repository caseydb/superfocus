"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "./store/store";
import { fetchUserData } from "./store/userSlice";
import { fetchTasks, checkForActiveTask } from "./store/taskSlice";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasAttemptedFetch = useRef(false);

  useEffect(() => {
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
        } catch (syncError) {
          // Silent error - will retry with user data fetch
        }

        // Wait a bit to ensure sync completed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Try to fetch user data
        try {
          const userData = await dispatch(fetchUserData()).unwrap();
          console.log("[ReduxInitializer] User data fetched:", userData);
          // If user data is fetched successfully, fetch tasks from PostgreSQL
          if (userData && userData.user_id) {
            console.log("[ReduxInitializer] Fetching tasks for user:", userData.user_id);
            const tasks = await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();
            console.log("[ReduxInitializer] Tasks fetched:", tasks);
            
            // Check for any active tasks in Firebase TaskBuffer
            await dispatch(checkForActiveTask({ 
              firebaseUserId: firebaseUser.uid, 
              userId: userData.user_id 
            })).unwrap();
          } else {
            console.log("[ReduxInitializer] No user_id found in userData");
          }
        } catch (error) {
          // Retry once after another delay
          setTimeout(async () => {
            try {
              const userData = await dispatch(fetchUserData()).unwrap();
              // If user data is fetched successfully, fetch tasks from PostgreSQL
              if (userData && userData.user_id) {
                await dispatch(fetchTasks({ userId: userData.user_id })).unwrap();
                
                // Check for any active tasks in Firebase TaskBuffer
                await dispatch(checkForActiveTask({ 
                  firebaseUserId: firebaseUser.uid, 
                  userId: userData.user_id 
                })).unwrap();
              }
            } catch (retryError) {}
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
