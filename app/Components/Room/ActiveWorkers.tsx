"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);

  useEffect(() => {
    if (!roomId) return;
    const activeRef = ref(rtdb, `instances/${roomId}/activeUsers`);
    const handle = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setActiveUsers(Object.values(data));
      } else {
        setActiveUsers([]);
      }
    });
    return () => off(activeRef, "value", handle);
  }, [roomId]);

  if (activeUsers.length === 0) return null;

  return (
    <div className="fixed top-5 sm:top-4 left-8 z-40 text-base font-mono opacity-70 select-none">
      {activeUsers.map((u) => (
        <div
          key={u.id}
          className={`text-gray-400 transition-opacity duration-300 ${
            flyingUserIds.includes(u.id) ? "opacity-0" : "opacity-100"
          }`}
          style={{ height: "2rem" }}
        >
          {u.displayName} is <span className="hidden sm:inline">actively </span>working
        </div>
      ))}
    </div>
  );
}
