// app/InstanceContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { ref, onValue, push, set, off, onDisconnect, remove, get } from "firebase/database";
import type { DataSnapshot } from "firebase/database";

// Types
export type InstanceType = "public" | "private";
type User = { id: string; displayName: string; isPremium: boolean };
type Instance = {
  id: string;
  type: InstanceType;
  users: User[];
  createdBy: string;
};

type InstanceFromDB = Omit<Instance, "id" | "users"> & { users?: Record<string, User> };

const InstanceContext = createContext<{
  instances: Instance[];
  currentInstance: Instance | null;
  joinInstance: (instanceId: string) => void;
  createInstance: (type: InstanceType) => void;
  leaveInstance: () => void;
}>({
  instances: [],
  currentInstance: null,
  joinInstance: () => {},
  createInstance: () => {},
  leaveInstance: () => {},
});

export const useInstance = () => useContext(InstanceContext);

// Generate a unique user for this session
function getOrCreateUser(): User {
  if (typeof window === "undefined") return { id: "", displayName: "", isPremium: false };
  const user = window.sessionStorage.getItem("mockUser");
  if (user) return JSON.parse(user);
  const newUser = {
    id: `user-${Math.random().toString(36).slice(2, 10)}`,
    displayName: `User ${Math.floor(Math.random() * 1000)}`,
    isPremium: false,
  };
  window.sessionStorage.setItem("mockUser", JSON.stringify(newUser));
  return newUser;
}

export const InstanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [currentInstance, setCurrentInstance] = useState<Instance | null>(null);
  const [user] = useState<User>(getOrCreateUser());

  // Listen for real-time updates to instances
  useEffect(() => {
    const instancesRef = ref(db, "instances");
    const handleValue = (snapshot: DataSnapshot) => {
      const data = snapshot.val() || {};
      const list: Instance[] = Object.entries(data).map(([id, value]) => {
        const v = value as InstanceFromDB;
        return {
          id,
          ...v,
          users: v.users ? Object.values(v.users) : [],
        };
      });
      setInstances(list);
      // If currentInstance is set, update it with the latest data
      if (currentInstance) {
        const updated = list.find((inst) => inst.id === currentInstance.id);
        if (updated) setCurrentInstance(updated);
      }
    };
    onValue(instancesRef, handleValue);
    return () => off(instancesRef, "value", handleValue);
    // eslint-disable-next-line
  }, [currentInstance]);

  // Create a new instance and join it
  const createInstance = useCallback(
    (type: InstanceType) => {
      const instancesRef = ref(db, "instances");
      const newInstanceRef = push(instancesRef);
      const newInstance: Omit<Instance, "id" | "users"> & { users: { [id: string]: User } } = {
        type,
        users: { [user.id]: user },
        createdBy: user.id,
      };
      set(newInstanceRef, newInstance);
      // Add onDisconnect logic for the user in the new instance
      const userRef = ref(db, `instances/${newInstanceRef.key}/users/${user.id}`);
      onDisconnect(userRef).remove();
      setCurrentInstance({ ...newInstance, id: newInstanceRef.key!, users: [user] });
    },
    [user]
  );

  // Join an existing instance
  const joinInstance = useCallback(
    (instanceId: string) => {
      const instanceRef = ref(db, `instances/${instanceId}/users/${user.id}`);
      set(instanceRef, user);
      onDisconnect(instanceRef).remove();
      setCurrentInstance((prev) => {
        const inst = instances.find((i) => i.id === instanceId);
        if (!inst) return prev;
        // Add user if not already present
        const userExists = inst.users.some((u) => u.id === user.id);
        return userExists ? inst : { ...inst, users: [...inst.users, user] };
      });
    },
    [user, instances]
  );

  // Leave the current instance
  const leaveInstance = useCallback(() => {
    if (!currentInstance) return;
    const userRef = ref(db, `instances/${currentInstance.id}/users/${user.id}`);
    setCurrentInstance(null);
    set(userRef, null).then(() => {
      // After removing user, check if any users remain
      const usersRef = ref(db, `instances/${currentInstance.id}/users`);
      get(usersRef).then((snapshot) => {
        if (!snapshot.exists() && currentInstance.type === "public") {
          // No users left and it's a public room, delete the room
          const instanceRef = ref(db, `instances/${currentInstance.id}`);
          remove(instanceRef);
        }
      });
    });
  }, [currentInstance, user]);

  return (
    <InstanceContext.Provider value={{ instances, currentInstance, joinInstance, createInstance, leaveInstance }}>
      {children}
    </InstanceContext.Provider>
  );
};
