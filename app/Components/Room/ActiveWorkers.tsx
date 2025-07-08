"use client";
import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

export default function ActiveWorkers({ roomId, flyingUserIds = [] }: { roomId: string; flyingUserIds?: string[] }) {
  const [activeUsers, setActiveUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [userStreaks, setUserStreaks] = useState<Record<string, number>>({});

  // Simple streak calculation (same as PersonalStats) - using UTC time
  const calculateStreak = (dailyCompletions: Record<string, boolean>) => {
    if (!dailyCompletions) return 0;

    const getStreakDate = (timestamp: number = Date.now()) => {
      const date = new Date(timestamp);
      const utcHour = date.getUTCHours();
      if (utcHour < 4) {
        date.setUTCDate(date.getUTCDate() - 1);
      }
      return date.toISOString().split("T")[0];
    };

    let currentStreak = 0;
    const currentStreakDate = getStreakDate();

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date();
      checkDate.setUTCDate(checkDate.getUTCDate() - i);
      if (new Date().getUTCHours() < 4) {
        checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      }
      const streakDateStr = checkDate.toISOString().split("T")[0];

      if (dailyCompletions[streakDateStr]) {
        currentStreak++;
      } else {
        if (streakDateStr !== currentStreakDate) {
          break;
        }
      }
    }
    return currentStreak;
  };

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

  // Load streaks for active users
  useEffect(() => {
    if (activeUsers.length === 0) {
      setUserStreaks({});
      return;
    }

    const streakHandles: Array<() => void> = [];
    const streaks: Record<string, number> = {};

    activeUsers.forEach((user) => {
      const dailyCompletionsRef = ref(rtdb, `users/${user.id}/dailyCompletions`);
      const handle = onValue(dailyCompletionsRef, (snapshot) => {
        const dailyCompletions = snapshot.val() || {};
        const currentStreak = calculateStreak(dailyCompletions);
        streaks[user.id] = currentStreak;
        setUserStreaks({ ...streaks });
      });

      streakHandles.push(() => off(dailyCompletionsRef, "value", handle));
    });

    return () => {
      streakHandles.forEach((cleanup) => cleanup());
    };
  }, [activeUsers]);

  if (activeUsers.length === 0) return null;

  return (
    <div className="fixed top-4 left-8 z-40 text-base font-mono opacity-70 select-none">
      {activeUsers.map((u) => (
        <div
          key={u.id}
          className={`text-gray-400 transition-opacity duration-300 flex items-center ${
            flyingUserIds.includes(u.id) ? "opacity-0" : "opacity-100"
          }`}
          style={{ height: "2rem" }}
        >
          {(userStreaks[u.id] || 0) > 0 && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center mr-2 border border-gray-400">
              <span className="text-[#9CA3AF] text-xs font-bold font-sans">{userStreaks[u.id]}</span>
            </div>
          )}
          <span>
            {u.displayName} is <span className="hidden sm:inline">actively </span>working
          </span>
        </div>
      ))}
    </div>
  );
}
