//Leaderboard

import React, { useEffect, useState } from "react";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";

interface HistoryEntry {
  displayName: string;
  task: string;
  duration: string;
  timestamp: number;
}

interface LeaderboardEntry {
  displayName: string;
  tasksCompleted: number;
  totalSeconds: number;
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

  useEffect(() => {
    if (!roomId) return;
    const historyRef = ref(rtdb, `instances/${roomId}/history`);
    const handle = onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      const userMap: Record<string, LeaderboardEntry> = {};
      if (data) {
        Object.values(data as Record<string, HistoryEntry>).forEach((entry) => {
          if (entry.task.toLowerCase().includes("quit early")) return;

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
            if (!userMap[entry.displayName]) {
              userMap[entry.displayName] = {
                displayName: entry.displayName,
                tasksCompleted: 0,
                totalSeconds: 0,
              };
            }
            userMap[entry.displayName].tasksCompleted += 1;
            userMap[entry.displayName].totalSeconds += seconds;
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
  }, [roomId]);

  if (loading) {
    return <div className="text-white text-center mt-10">Loading leaderboard...</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-[#181f2a] rounded-3xl shadow-2xl px-10 py-8 w-[800px] max-w-full flex flex-col items-center gap-6 border-4 border-[#181f2a]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full mb-2">
          <button
            className="w-12 h-12 rounded-lg bg-[#232b3a] flex items-center justify-center text-2xl text-gray-400 cursor-not-allowed"
            disabled
          >
            ←
          </button>
          <div className="text-white text-xl font-bold select-none">Monday 30th June – Sunday 13th July</div>
          <button
            className="w-12 h-12 rounded-lg bg-[#232b3a] flex items-center justify-center text-2xl text-gray-400 cursor-not-allowed"
            disabled
          >
            →
          </button>
        </div>
        <div className="text-4xl font-extrabold text-white mb-2 mt-2">Leaderboard</div>
        <table className="w-full text-left mt-2">
          <thead>
            <tr className="text-gray-400 text-lg">
              <th className="px-6 py-2">Name</th>
              <th className="px-6 py-2">Tasks Completed</th>
              <th className="px-6 py-2">Total Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <React.Fragment key={entry.displayName}>
                <tr className="text-white text-lg font-mono align-middle" style={{ height: 64 }}>
                  <td className="px-6 py-4 bg-[#131722] rounded-l-xl font-mono">{entry.displayName}</td>
                  <td className="px-6 py-4 bg-[#131722] text-center text-xl">{entry.tasksCompleted}</td>
                  <td className="px-6 py-4 bg-[#131722] rounded-r-xl text-right font-mono">
                    {formatTime(entry.totalSeconds)}
                  </td>
                </tr>
                {i < entries.length - 1 && (
                  <tr aria-hidden="true">
                    <td colSpan={3} style={{ height: 16, background: "transparent" }}></td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <button
          className="mt-6 bg-[#FFAA00] text-black font-extrabold text-xl px-10 py-3 rounded-lg shadow hover:scale-105 transition-transform"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
