"use client";
import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { ref, onValue, off } from "firebase/database";

export default function ActiveWorkers({ roomId }: { roomId: string }) {
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
    <div className="fixed top-4 right-8 z-50 text-base font-mono bg-white/80 rounded shadow px-4 py-2">
      <div className="font-bold mb-1">Active Users:</div>
      {activeUsers.map((u) => (
        <div key={u.id}>{u.displayName}</div>
      ))}
    </div>
  );
}
