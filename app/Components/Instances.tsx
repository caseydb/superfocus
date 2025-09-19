"use client";
// app/InstanceContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Instance, InstanceType, User } from "../types";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createPublicRoom } from "@/app/utils/publicRooms";
import { createPrivateRoom } from "@/app/utils/privateRooms";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";


const InstanceContext = createContext<{
  instances: Instance[];
  currentInstance: Instance | null;
  createInstance: (type: InstanceType, customUrl?: string) => void;
  user: User;
  userReady: boolean;
  setPublicRoomInstance: (instance: Instance) => void;
}>({
  instances: [],
  currentInstance: null,
  createInstance: () => {},
  user: { id: "", displayName: "", isPremium: false },
  userReady: false,
  setPublicRoomInstance: () => {},
});

export const useInstance = () => useContext(InstanceContext);

// Removed getOrCreateUser - now using Firebase anonymous auth for all users

// Process display name from auth
function processDisplayName(firebaseUser: { displayName?: string | null; email?: string | null }): string {
  // Use displayName if available
  if (firebaseUser.displayName) {
    return firebaseUser.displayName;
  }

  // Process email if available
  if (firebaseUser.email) {
    const username = firebaseUser.email.split("@")[0];
    // Capitalize first letter and keep the rest as is
    return username.charAt(0).toUpperCase() + username.slice(1);
  }

  return "Anonymous";
}

// Generate a random readable URL for the room
function generateRoomUrl(): string {
  const adjectives = ["swift", "bright", "calm", "bold", "cool", "fast", "kind", "warm", "zen"];
  const nouns = ["tiger", "eagle", "wolf", "bear", "fox", "lion", "hawk", "shark", "deer", "owl", "kiwi"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);
  return `${adjective}-${noun}-${number}`;
}

export const InstanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [currentInstance, setCurrentInstance] = useState<Instance | null>(null);
  // Start with a placeholder user - will be replaced by Firebase auth
  const [user, setUser] = useState<User>({ id: "", displayName: "Loading...", isPremium: false });
  const [userReady, setUserReady] = useState(false);
  
  // Get Redux user data
  const reduxUser = useSelector((state: RootState) => state.user);

  // Update user from Firebase Auth if signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Prefer Redux user data if available (authenticated user)
        let displayName = "Guest User";
        
        if (!reduxUser.isGuest && reduxUser.first_name) {
          // Use Redux data for authenticated users
          displayName = reduxUser.last_name 
            ? `${reduxUser.first_name} ${reduxUser.last_name}`
            : reduxUser.first_name;
        } else if (!firebaseUser.isAnonymous) {
          // Fallback to Firebase display name for authenticated users without Redux data yet
          displayName = processDisplayName(firebaseUser);
        }
        
        // Use Firebase UID for both anonymous and authenticated users
        // This ensures presence tracking works for guests
        const newUser = {
          id: firebaseUser.uid,
          displayName,
          isPremium: false, // update if you have premium logic
        };
        setUser(newUser);
        setUserReady(true);
      } else {
        // No Firebase auth yet - wait for anonymous auth to kick in
        // Don't set userReady to true yet
        console.info('[InstanceProvider] No Firebase auth user; using visitor context');
        setUser({ id: '', displayName: 'Visitor', isPremium: false });
        setUserReady(true);
      }
    });
    return () => unsub();
  }, [reduxUser]); // Add reduxUser as dependency to update when Redux state changes

  // Legacy instances listener removed - now using PrivateRooms and EphemeralRooms
  // Instances array no longer needed
  useEffect(() => {
    setInstances([]);
  }, []);

  // Create a new instance and join it
  const createInstance = useCallback(
    async (type: InstanceType, customUrl?: string) => {
      if (!userReady || reduxUser.isGuest) {
        return;
      }
      
      if (type === "public") {
        // Use new PublicRooms system for public rooms
        try {
          const publicRoom = await createPublicRoom(user.id, customUrl);
          
          // Create a temporary Instance object for compatibility
          const tempInstance: Instance = {
            id: publicRoom.id,
            type: "public",
            users: [user],
            createdBy: publicRoom.createdBy,
            url: publicRoom.url,
          };
          setCurrentInstance(tempInstance);
        } catch {
          // Silent error handling - error details not needed
        }
      } else {
        // Use new PrivateRooms system for private rooms
        try {
          const privateRoom = await createPrivateRoom(user.id, customUrl || generateRoomUrl());
          
          // Create a temporary Instance object for compatibility
          const tempInstance: Instance = {
            id: privateRoom.id,
            type: "private",
            users: [user],
            createdBy: privateRoom.createdBy,
            url: privateRoom.url,
          };
          setCurrentInstance(tempInstance);
        } catch {
          // Silent error handling - error details not needed
        }
      }
    },
    [user, userReady, reduxUser.isGuest]
  );

  // Set a PublicRoom as the current instance (for new PublicRooms system)
  const setPublicRoomInstance = useCallback((instance: Instance) => {
    setCurrentInstance(instance);
  }, []);

  return (
    <InstanceContext.Provider
      value={{ instances, currentInstance, createInstance, user, userReady, setPublicRoomInstance }}
    >
      {children}
    </InstanceContext.Provider>
  );
};
