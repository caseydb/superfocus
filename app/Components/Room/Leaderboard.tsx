//Leaderboard

import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

interface HistoryEntry {
  displayName: string;
  task: string;
  duration: string;
  timestamp: number;
  userId?: string;
}

interface LeaderboardEntry {
  displayName: string;
  tasksCompleted: number;
  totalSeconds: number;
}

interface User {
  id: string;
  displayName: string;
}

function formatTime(totalSeconds: number) {
  // Handle invalid input
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "00:00:00";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  // Format based on duration length (same as Timer component)
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export default function Leaderboard({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Record<string, User>>({});

  useEffect(() => {
    if (!roomId) return;
    const usersRef = ref(rtdb, `instances/${roomId}/users`);
    const handle = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setUsers(data);
      } else {
        setUsers({});
      }
    });
    return () => off(usersRef, "value", handle);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const historyRef = ref(rtdb, `instances/${roomId}/history`);
    const handle = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      const userMap: Record<string, LeaderboardEntry> = {};
      if (data) {
        Object.values(data as Record<string, HistoryEntry>).forEach((entry) => {
          if (entry.task.toLowerCase().includes("quit early")) return;

          // Use userId as key, fallback to displayName for legacy entries
          const userKey = entry.userId || entry.displayName;

          // Get current display name (check users first, fallback to stored name)
          const currentDisplayName =
            entry.userId && users[entry.userId]?.displayName ? users[entry.userId].displayName : entry.displayName;

          // Parse duration more robustly
          let seconds = 0;
          if (entry.duration && typeof entry.duration === "string") {
            const parts = entry.duration.split(":").map(Number);
            if (parts.length === 3) {
              // hh:mm:ss format
              const [h, m, s] = parts;
              if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
                seconds = h * 3600 + m * 60 + s;
              }
            } else if (parts.length === 2) {
              // mm:ss format
              const [m, s] = parts;
              if (!isNaN(m) && !isNaN(s)) {
                seconds = m * 60 + s;
              }
            }
          }

          // Only process if we got valid seconds
          if (seconds > 0) {
            if (!userMap[userKey]) {
              userMap[userKey] = {
                displayName: currentDisplayName,
                tasksCompleted: 0,
                totalSeconds: 0,
              };
            } else {
              // Update display name to current one (in case it changed)
              userMap[userKey].displayName = currentDisplayName;
            }
            userMap[userKey].tasksCompleted += 1;
            userMap[userKey].totalSeconds += seconds;
          }
        });
      }
      const arr = Object.values(userMap).sort(
        (a, b) => b.tasksCompleted - a.tasksCompleted || b.totalSeconds - a.totalSeconds
      );
      setEntries(arr);
      setLoading(false);
    });
    return () => off(historyRef, "value", handle);
  }, [roomId, users]);

  if (loading) {
    return <div className="text-white text-center mt-10">Loading leaderboard...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#181f2a] rounded-3xl shadow-2xl px-4 sm:px-6 md:px-10 py-6 sm:py-8 w-[95%] sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full flex flex-col items-center gap-4 sm:gap-6 border-4 border-[#181f2a] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-2">
          <button
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#232b3a] flex items-center justify-center text-lg sm:text-2xl text-gray-400 cursor-not-allowed"
            disabled
          >
            ←
          </button>
          <div className="text-white text-sm sm:text-lg md:text-xl font-bold select-none text-center px-2">
            Monday 30th June – Sunday 13th July
          </div>
          <button
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#232b3a] flex items-center justify-center text-lg sm:text-2xl text-gray-400 cursor-not-allowed"
            disabled
          >
            →
          </button>
        </div>
        <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-2 mt-2">Leaderboard</div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left mt-2 min-w-[300px]">
            <thead>
              <tr className="text-gray-400 text-sm sm:text-base md:text-lg">
                <th className="px-2 sm:px-4 md:px-6 py-2">Name</th>
                <th className="px-2 sm:px-4 md:px-6 py-2 text-center">Tasks</th>
                <th className="px-2 sm:px-4 md:px-6 py-2 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <React.Fragment key={`${entry.displayName}-${i}`}>
                  <tr
                    className="text-white text-sm sm:text-base md:text-lg font-mono align-middle"
                    style={{ height: 48 }}
                  >
                    <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-[#131722] rounded-l-xl font-mono truncate max-w-[120px] sm:max-w-none">
                      {entry.displayName}
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-[#131722] text-center text-lg sm:text-xl">
                      {entry.tasksCompleted}
                    </td>
                    <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-[#131722] rounded-r-xl text-right font-mono">
                      {formatTime(entry.totalSeconds)}
                    </td>
                  </tr>
                  {i < entries.length - 1 && (
                    <tr aria-hidden="true">
                      <td colSpan={3} style={{ height: 12, background: "transparent" }}></td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="mt-4 sm:mt-6 bg-[#FFAA00] text-black font-extrabold text-lg sm:text-xl px-8 sm:px-10 py-3 rounded-lg shadow hover:scale-105 transition-transform"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
