//Leaderboard

import React, { useEffect, useState, useMemo } from "react";
import { DotSpinner } from 'ldrs/react';
import 'ldrs/react/DotSpinner.css';
import { useAppSelector, useAppDispatch } from "../../store/hooks";
import { fetchLeaderboard } from "../../store/leaderboardSlice";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import Image from "next/image";
import { signInWithGoogle } from "@/lib/auth";
import SignIn from "../SignIn";
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
  const dispatch = useAppDispatch();
  const { entries: apiData, loading, timeFilter } = useAppSelector((state) => state.leaderboard);
  const currentUser = useSelector((state: RootState) => state.user);
  const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [currentSprint] = useState(getCurrentSprintNumber());
  const [page, setPage] = useState(1);
  const [countdown, setCountdown] = useState<string>("");
  const [showSignInModal, setShowSignInModal] = useState(false);
  const PAGE_SIZE = currentUser.isGuest ? 7 : 10;

  // Fetch leaderboard data on component mount
  useEffect(() => {
    dispatch(fetchLeaderboard(timeFilter));
  }, [dispatch, timeFilter]);

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

  // Countdown timer for "This Week" view
  useEffect(() => {
    if (timeFilter !== 'this_week') return;

    const calculateCountdown = () => {
      const now = new Date();
      
      // Get next Monday 00:00:00 UTC
      const nextMonday = new Date();
      const nowUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
      ));
      
      // Calculate days until next Monday
      const dayOfWeek = nowUTC.getUTCDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
      
      // Set to next Monday 00:00:00 UTC
      nextMonday.setUTCDate(nowUTC.getUTCDate() + daysUntilMonday);
      nextMonday.setUTCHours(0, 0, 0, 0);
      
      // Calculate difference
      const diff = nextMonday.getTime() - now.getTime();
      
      if (diff <= 0) {
        setCountdown("Resetting...");
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [timeFilter]);

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

  // Pagination
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginatedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  
  // Navigation helpers (disabled for now since we're showing all-time data)
  const sprintHasEnded = false; // hasSprintEnded(currentSprint);

  // Don't show initial loading state to prevent flicker

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-2.5 sm:py-3 w-[95%] max-w-[700px] flex flex-col items-center gap-1 sm:gap-2 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Keyboard Shortcut Tip - positioned at top left */}
        <div className="absolute top-2 left-3 hidden md:block">
          <span className="px-2.5 py-1 bg-gray-800 rounded text-xs text-gray-500">⌘L</span>
        </div>
        {/* Close button - positioned absolutely */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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

        <div className="flex flex-col items-center w-full relative mt-3">
          {/* Title on first line */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00] mb-2">Leaderboard</h2>
          
          {/* Beautiful Switch Component */}
          <div className="flex items-center gap-1 bg-gray-800/50 rounded-full p-1 mb-2">
            <button
              onClick={() => {
                setPage(1);
                dispatch(fetchLeaderboard('this_week'));
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                timeFilter === 'this_week'
                  ? 'bg-[#FFAA00] text-black'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => {
                setPage(1);
                dispatch(fetchLeaderboard('all_time'));
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                timeFilter === 'all_time'
                  ? 'bg-[#FFAA00] text-black'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              All Time
            </button>
          </div>
          
          {/* Total and countdown on second line */}
          <div className="flex flex-col items-center gap-1 mb-2">
            <span className="text-sm text-gray-400 font-mono">
              <span className="text-gray-500">Total:</span> <span className="text-[#FFAA00] font-semibold">{formatTime(totalTimeAllUsers)}</span>
            </span>
            {timeFilter === 'this_week' && countdown && (
              <span className="text-xs text-gray-500 font-mono">
                Resets in: <span className="text-gray-400">{countdown} (UTC)</span>
              </span>
            )}
          </div>
        </div>
        
        {/* Show winners for ended sprints, regular list for active sprint */}
        {sprintHasEnded && entries.length > 0 ? (
          <div className="w-full space-y-4">
            {/* Velocity Cup - Most Tasks */}
            <div>
              <h3 className="text-lg font-bold text-[#FFAA00] text-center mb-2">🏆 Velocity Cup</h3>
              <div className="flex justify-center items-end gap-2 mb-2">
                {/* 2nd Place */}
                {entries[1] && (
                  <div className="text-center">
                    <div className="text-xs font-bold text-gray-300">{entries[1].displayName}</div>
                    <div className="w-20 h-16 bg-gray-300 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-lg">🥈</div>
                      <div className="text-xs font-bold text-gray-800">{entries[1].tasksCompleted}</div>
                      <div className="text-[10px] text-gray-600">tasks</div>
                    </div>
                  </div>
                )}
                {/* 1st Place */}
                {entries[0] && (
                  <div className="text-center">
                    <div className="text-xs font-bold text-yellow-400">{entries[0].displayName}</div>
                    <div className="w-20 h-20 bg-yellow-400 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-lg">🥇</div>
                      <div className="text-xs font-bold text-gray-800">{entries[0].tasksCompleted}</div>
                      <div className="text-[10px] text-gray-800">tasks</div>
                    </div>
                  </div>
                )}
                {/* 3rd Place */}
                {entries[2] && (
                  <div className="text-center">
                    <div className="text-xs font-bold text-amber-700">{entries[2].displayName}</div>
                    <div className="w-20 h-14 bg-amber-700 rounded-t-lg flex flex-col items-center justify-center">
                      <div className="text-lg">🥉</div>
                      <div className="text-xs font-bold text-gray-100">{entries[2].tasksCompleted}</div>
                      <div className="text-[10px] text-gray-200">tasks</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Time Keeper's Cup - Most Time */}
            <div>
              <h3 className="text-lg font-bold text-[#FFAA00] text-center mb-2">
                ⏱️ Time Keeper&apos;s Cup
              </h3>
              <div className="flex justify-center items-end gap-2 mb-2">
                {/* Sort by time for this view */}
                {(() => {
                  const timeEntries = [...entries].sort((a, b) => b.totalSeconds - a.totalSeconds);
                  return (
                    <>
                      {/* 2nd Place */}
                      {timeEntries[1] && (
                        <div className="text-center">
                          <div className="text-xs font-bold text-gray-300">
                            {timeEntries[1].displayName}
                          </div>
                          <div className="w-20 h-16 bg-gray-300 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-lg">🥈</div>
                            <div className="text-xs font-bold text-gray-800">
                              {formatTime(timeEntries[1].totalSeconds)}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* 1st Place */}
                      {timeEntries[0] && (
                        <div className="text-center">
                          <div className="text-xs font-bold text-yellow-400">
                            {timeEntries[0].displayName}
                          </div>
                          <div className="w-20 h-20 bg-yellow-400 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-lg">🥇</div>
                            <div className="text-xs font-bold text-gray-800">
                              {formatTime(timeEntries[0].totalSeconds)}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* 3rd Place */}
                      {timeEntries[2] && (
                        <div className="text-center">
                          <div className="text-xs font-bold text-amber-700">
                            {timeEntries[2].displayName}
                          </div>
                          <div className="w-20 h-14 bg-amber-700 rounded-t-lg flex flex-col items-center justify-center">
                            <div className="text-lg">🥉</div>
                            <div className="text-xs font-bold text-gray-100">
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
          <div className="w-full space-y-1.5" style={{ minHeight: `${PAGE_SIZE * 40 + (PAGE_SIZE - 1) * 6}px` }}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <DotSpinner size="30" speed="0.9" color="#FFAA00" />
              </div>
            ) : paginatedEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                No entries for this time period
              </div>
            ) : (
              paginatedEntries.map((entry, i) => (
                <div
                  key={`${entry.displayName}-${(page - 1) * PAGE_SIZE + i}`}
                  className="bg-gray-800 rounded-lg px-4 py-1.5 border border-gray-700 w-full"
                >
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex-1">
                      <div className="font-mono text-base font-medium text-white">
                        <span className="text-gray-500 text-sm mr-2">#{(page - 1) * PAGE_SIZE + i + 1}</span>
                        {entry.displayName}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="font-mono text-base font-medium text-green-400">
                        {formatTime(entry.totalSeconds)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {entry.tasksCompleted} tasks
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {/* Pagination controls - compact and elegant */}
        {entries.length > PAGE_SIZE && (
          <div className="-mt-3 flex items-center justify-center gap-2">
            <button
              className={`p-1.5 rounded transition-colors ${
                page === 1
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-[#FFAA00] hover:bg-gray-800 cursor-pointer"
              }`}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-1 text-xs font-mono">
              <span className="text-gray-500">{page}</span>
              <span className="text-gray-600">/</span>
              <span className="text-gray-500">{totalPages}</span>
            </div>
            <button
              className={`p-1.5 rounded transition-colors ${
                page === totalPages
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-[#FFAA00] hover:bg-gray-800 cursor-pointer"
              }`}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Continue with Google button for guest users */}
        {currentUser.isGuest && (
          <div className="mt-6 mb-2 flex flex-col items-center gap-2 border-t border-gray-700 pt-4">
            <button
              onClick={() => signInWithGoogle()}
              className="flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 px-5 bg-white text-gray-900 text-base font-semibold shadow-sm hover:border-[#FFAA00] transition cursor-pointer"
            >
              <Image src="/google.png" alt="Google" width={20} height={20} />
              Continue with Google to participate
            </button>
            <button
              onClick={() => setShowSignInModal(true)}
              className="text-gray-500 text-xs hover:text-gray-400 transition-colors cursor-pointer"
            >
              or sign in manually
            </button>
          </div>
        )}

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
      
      {/* Sign In Modal */}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowSignInModal(false)}
        >
          <div className="relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <SignIn />
          </div>
        </div>
      )}
    </div>
  );
}
