//Leaderboard

import React, { useEffect, useState, useMemo } from "react";
import { DotSpinner } from 'ldrs/react';
import 'ldrs/react/DotSpinner.css';
import { useAppSelector } from "../../store/hooks";
// TODO: Remove firebase imports when replacing with proper persistence
// import { rtdb } from "../../../lib/firebase";
// import { ref, onValue, off } from "firebase/database";

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


// Sprint period calculations - 2 week sprints starting from anchor date
const SPRINT_ANCHOR_DATE = new Date("2024-12-30"); // Monday Dec 30, 2024
const SPRINT_DURATION_DAYS = 14; // 2 weeks

// Get the start date of a sprint period (0-indexed)
function getSprintStart(sprintNumber: number): Date {
  const start = new Date(SPRINT_ANCHOR_DATE);
  start.setDate(start.getDate() + sprintNumber * SPRINT_DURATION_DAYS);
  start.setHours(0, 0, 0, 0);
  return start;
}

// Get the end date of a sprint period
function getSprintEnd(sprintNumber: number): Date {
  const end = new Date(getSprintStart(sprintNumber));
  end.setDate(end.getDate() + SPRINT_DURATION_DAYS - 1);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Get current sprint number
function getCurrentSprintNumber(): number {
  const now = new Date();
  const diffTime = now.getTime() - SPRINT_ANCHOR_DATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / SPRINT_DURATION_DAYS);
}

// Format sprint date range label - kept for future use
// function formatSprintLabel(sprintNumber: number): string {
//   const start = getSprintStart(sprintNumber);
//   const end = getSprintEnd(sprintNumber);
//
//   const months = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December",
//   ];
//   const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
//
//   const formatDate = (date: Date) => {
//     const day = date.getDate();
//     const suffix =
//       day % 10 === 1 && day !== 11
//         ? "st"
//         : day % 10 === 2 && day !== 12
//         ? "nd"
//         : day % 10 === 3 && day !== 13
//         ? "rd"
//         : "th";
//     return `${days[date.getDay()]} ${day}${suffix} ${months[date.getMonth()]}`;
//   };
//
//   return `${formatDate(start)} – ${formatDate(end)}`;
// }

// Check if a sprint has ended - kept for future use
// function hasSprintEnded(sprintNumber: number): boolean {
//   const end = getSprintEnd(sprintNumber);
//   return new Date() > end;
// }

function formatTime(totalSeconds: number) {
  // Handle invalid input
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Format based on duration length (same as PersonalStats)
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export default function Leaderboard({ onClose }: { onClose: () => void }) {
  const { entries: apiData, loading } = useAppSelector((state) => state.leaderboard);
  const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [currentSprint, setCurrentSprint] = useState(getCurrentSprintNumber());

  // TODO: Replace with Firebase RTDB listener for users
  useEffect(() => {
    // Temporary: No users data
    setUsers({});
  }, []);

  // TODO: Replace with Firebase RTDB listener for history
  useEffect(() => {
    // Temporary: No history data
    setAllHistory([]);
  }, []);

  // Calculate entries from API data (all-time for now, sprint filtering can be added later)
  const entries = useMemo(() => {
    // For now, use API data directly without sprint filtering
    return apiData.map(user => ({
      displayName: `${user.first_name} ${user.last_name}`,
      tasksCompleted: user.total_tasks,
      totalSeconds: user.total_duration
    })).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [apiData]);

  // Calculate total time across all users
  const totalTimeAllUsers = useMemo(() => {
    return entries.reduce((sum, entry) => sum + entry.totalSeconds, 0);
  }, [entries]);

  // Original sprint-based calculation (kept for reference but not used)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _entriesOld = useMemo(() => {
    const userMap: Record<string, LeaderboardEntry> = {};
    const sprintStart = getSprintStart(currentSprint).getTime();
    const sprintEnd = getSprintEnd(currentSprint).getTime();

    allHistory.forEach((entry) => {
      // Filter by sprint dates
      if (entry.timestamp < sprintStart || entry.timestamp > sprintEnd) return;

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

    return Object.values(userMap).sort(
      (a, b) => b.tasksCompleted - a.tasksCompleted || b.totalSeconds - a.totalSeconds
    );
  }, [allHistory, users, currentSprint]);

  // Determine which sprints have data - kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _sprintsWithData = useMemo(() => {
    const sprints = new Set<number>();
    allHistory.forEach((entry) => {
      const timestamp = entry.timestamp;
      const diffTime = timestamp - SPRINT_ANCHOR_DATE.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const sprintNum = Math.floor(diffDays / SPRINT_DURATION_DAYS);
      if (sprintNum >= 0) {
        sprints.add(sprintNum);
      }
    });
    return Array.from(sprints).sort((a, b) => a - b);
  }, [allHistory]);

  // Navigation helpers (disabled for now since we're showing all-time data)
  const canGoBack = false; // currentSprint > 0 && sprintsWithData.includes(currentSprint - 1);
  const canGoForward = false; // sprintsWithData.includes(currentSprint + 1);
  const sprintHasEnded = false; // hasSprintEnded(currentSprint);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <DotSpinner size="40" speed="0.9" color="#FFAA00" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-6 sm:py-8 w-[95%] sm:w-[600px] md:w-[700px] lg:w-[800px] max-w-full flex flex-col items-center gap-4 sm:gap-6 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - positioned absolutely */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
        >
          <svg
            className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center justify-center gap-2 w-full mb-2">
          <button
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg sm:text-2xl transition-colors ${
              canGoBack ? "text-white hover:bg-gray-700 cursor-pointer" : "text-gray-600 cursor-not-allowed"
            }`}
            disabled={!canGoBack}
            onClick={() => canGoBack && setCurrentSprint(currentSprint - 1)}
          >
            ←
          </button>
          <div className="text-white text-sm sm:text-lg md:text-xl font-bold select-none text-center px-2">
            All Time
          </div>
          <button
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg sm:text-2xl transition-colors ${
              canGoForward ? "text-white hover:bg-gray-700 cursor-pointer" : "text-gray-600 cursor-not-allowed"
            }`}
            disabled={!canGoForward}
            onClick={() => canGoForward && setCurrentSprint(currentSprint + 1)}
          >
            →
          </button>
        </div>
        {/* Header with title */}
        <div className="w-full text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-2 mt-2">Global Leaderboard</h2>
          {/* Total time display */}
          <div className="text-sm sm:text-base text-gray-400 mt-2">
            Total time: <span className="text-[#FFAA00] font-bold">{formatTime(totalTimeAllUsers)}</span>
          </div>
        </div>
        {/* Show winners for ended sprints, regular table for active sprint */}
        {sprintHasEnded && entries.length > 0 ? (
          <div className="w-full">
            {/* Velocity Cup - Most Tasks */}
            <div className="mb-8">
              <h3 className="text-xl sm:text-2xl font-bold text-[#FFAA00] text-center mb-4">🏆 Velocity Cup</h3>
              <div className="flex justify-center items-end gap-4 mb-2">
                {/* 2nd Place */}
                {entries[1] && (
                  <div className="text-center">
                    <div className="text-sm sm:text-base font-bold text-gray-300 mb-1">{entries[1].displayName}</div>
                    <div className="w-24 sm:w-32 h-20 sm:h-24 bg-gray-300 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-xl sm:text-2xl mb-0.5">🥈</div>
                      <div className="text-xs sm:text-sm font-bold text-gray-800">{entries[1].tasksCompleted}</div>
                      <div className="text-xs text-gray-600">tasks</div>
                    </div>
                  </div>
                )}
                {/* 1st Place */}
                {entries[0] && (
                  <div className="text-center">
                    <div className="text-sm sm:text-base font-bold text-yellow-400 mb-1">{entries[0].displayName}</div>
                    <div className="w-24 sm:w-32 h-24 sm:h-28 bg-yellow-400 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-xl sm:text-2xl mb-0.5">🥇</div>
                      <div className="text-xs sm:text-sm font-bold text-gray-800">{entries[0].tasksCompleted}</div>
                      <div className="text-xs text-gray-800">tasks</div>
                    </div>
                  </div>
                )}
                {/* 3rd Place */}
                {entries[2] && (
                  <div className="text-center">
                    <div className="text-sm sm:text-base font-bold text-amber-700 mb-1">{entries[2].displayName}</div>
                    <div className="w-24 sm:w-32 h-16 sm:h-20 bg-amber-700 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-xl sm:text-2xl mb-0.5">🥉</div>
                      <div className="text-xs sm:text-sm font-bold text-gray-100">{entries[2].tasksCompleted}</div>
                      <div className="text-xs text-gray-200">tasks</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Time Keeper's Cup - Most Time */}
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#FFAA00] text-center mb-4">
                ⏱️ Time Keeper&apos;s Cup
              </h3>
              <div className="flex justify-center items-end gap-4 mb-2">
                {/* Sort by time for this view */}
                {(() => {
                  const timeEntries = [...entries].sort((a, b) => b.totalSeconds - a.totalSeconds);
                  return (
                    <>
                      {/* 2nd Place */}
                      {timeEntries[1] && (
                        <div className="text-center">
                          <div className="text-sm sm:text-base font-bold text-gray-300 mb-1">
                            {timeEntries[1].displayName}
                          </div>
                          <div className="w-24 sm:w-32 h-20 sm:h-24 bg-gray-300 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-xl sm:text-2xl mb-0.5">🥈</div>
                            <div className="text-xs sm:text-sm font-bold text-gray-800">
                              {formatTime(timeEntries[1].totalSeconds)}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* 1st Place */}
                      {timeEntries[0] && (
                        <div className="text-center">
                          <div className="text-sm sm:text-base font-bold text-yellow-400 mb-1">
                            {timeEntries[0].displayName}
                          </div>
                          <div className="w-24 sm:w-32 h-24 sm:h-28 bg-yellow-400 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-xl sm:text-2xl mb-0.5">🥇</div>
                            <div className="text-xs sm:text-sm font-bold text-gray-800">
                              {formatTime(timeEntries[0].totalSeconds)}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* 3rd Place */}
                      {timeEntries[2] && (
                        <div className="text-center">
                          <div className="text-sm sm:text-base font-bold text-amber-700 mb-1">
                            {timeEntries[2].displayName}
                          </div>
                          <div className="w-24 sm:w-32 h-16 sm:h-20 bg-amber-700 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-xl sm:text-2xl mb-0.5">🥉</div>
                            <div className="text-xs sm:text-sm font-bold text-gray-100">
                              {formatTime(timeEntries[2].totalSeconds)}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
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
                      <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-gray-800 rounded-l-xl font-mono truncate max-w-[120px] sm:max-w-none">
                        {entry.displayName}
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-gray-800 text-center text-lg sm:text-xl">
                        {entry.tasksCompleted}
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-3 sm:py-4 bg-gray-800 rounded-r-xl text-right font-mono">
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
        )}

        {/* Keyboard Shortcut Tip */}
        <div className="mt-4 text-center text-xs text-gray-500">
          Shortcut <span className="px-2 py-1 bg-gray-800 rounded">⌘L</span>
        </div>
      </div>

      {/* Add scrollbar styling */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f2937;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ffaa00;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff9500;
        }
      `}</style>
    </div>
  );
}
