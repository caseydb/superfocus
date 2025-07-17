"use client";

import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "./store/store";
import { fetchUserData } from "./store/userSlice";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function ReduxInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const hasAttemptedFetch = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("🔄 Redux Initializer - Auth state changed:", firebaseUser?.email || "no user");

      if (firebaseUser && !hasAttemptedFetch.current) {
        hasAttemptedFetch.current = true;
        console.log("🚀 Redux Initializer - Starting user data fetch for:", firebaseUser.email);

        // Wait a bit for sync-user to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Try to fetch user data
        try {
          const userData = await dispatch(fetchUserData()).unwrap();
          console.log("✅ Redux user data loaded successfully:", userData);
          console.log("📋 User details:", {
            user_id: userData.user_id,
            email: userData.email,
            first_name: userData.first_name,
            last_name: userData.last_name,
            profile_image: userData.profile_image,
          });
        } catch (error) {
          console.log("⏳ User not synced yet, will retry once...");
          // Retry once after another delay
          setTimeout(async () => {
            try {
              const userData = await dispatch(fetchUserData()).unwrap();
              console.log("✅ Redux user data loaded on retry:", userData);
              console.log("📋 User details:", {
                user_id: userData.user_id,
                email: userData.email,
                first_name: userData.first_name,
                last_name: userData.last_name,
                profile_image: userData.profile_image,
              });
            } catch (retryError) {
              console.log("❌ User data not available after retry", retryError);
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
