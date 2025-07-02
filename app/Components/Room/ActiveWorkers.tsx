"use client";
import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { ref, onValue, off } from "firebase/database";

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);

  useEffect(() => {
    if (!roomId) return;
    const activeRef = ref(db, `instances/${roomId}/activeUsers`);
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
    <div className="fixed top-4 left-8 z-50 text-base font-mono opacity-70 select-none">
      {activeUsers.map((u) => (
        <div
          key={u.id}
          className={`text-gray-400 transition-opacity duration-300 ${
            flyingUserIds.includes(u.id) ? "opacity-0" : "opacity-100"
          }`}
          style={{ height: "2rem" }}
        >
          {u.displayName} is actively working
        </div>
      ))}
    </div>
  );
}
