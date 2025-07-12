//History

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

interface User {
  id: string;
  displayName: string;
}

function formatDuration(duration: string): string {
  // Parse the duration string (could be HH:MM:SS or MM:SS)
  const parts = duration.split(":").map(Number);

  if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  } else if (parts.length === 2) {
    // MM:SS format - check if minutes >= 60
    const [minutes, seconds] = parts;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}:${remainingMinutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  // Fallback - return as is
  return duration;
}

// Truncate text to specified length
const truncateText = (text: string, maxLength: number = 50) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// Calculate dynamic width based on history content
const calculateDynamicWidth = (history: HistoryEntry[]) => {
  if (history.length === 0) return "w-[95%] min-[600px]:w-[90%] min-[1028px]:w-[60%]";

  const maxTaskLength = Math.max(...history.map((entry) => entry.task.length));

  // Base percentages for different screen sizes
  const basePercentage = 95; // < 600px
  const mediumPercentage = 90; // 600px - 1028px
  const largePercentage = 60; // >= 1028px

  // Calculate multiplier based on max task length - grow more aggressively
  let multiplier = 1;
  if (maxTaskLength > 20) {
    multiplier = Math.min(1 + (maxTaskLength - 20) / 100, 1.4); // More conservative growth for percentages
  }

  const smallWidth = Math.min(Math.round(basePercentage * multiplier), 95); // Cap at 95%
  const mediumWidth = Math.min(Math.round(mediumPercentage * multiplier), 90); // Cap at 90%
  const largeWidth = Math.min(Math.round(largePercentage * multiplier), 85); // Cap at 85%

  return `w-[${smallWidth}%] min-[600px]:w-[${mediumWidth}%] min-[1028px]:w-[${largeWidth}%]`;
};

// Calculate PAGE_SIZE based on screen size
const calculatePageSize = (width: number, height: number) => {
  // If width >= 1024px (desktop table layout), use height-based logic for large screens
  if (width >= 1024) {
    if (height >= 850) return 15;
    if (height >= 800) return 13;
    if (height >= 750) return 10;
    if (height >= 700) return 7;
    if (height >= 650) return 5;
    if (height <= 650) return 3;
    return 5; // Default for large screens
  }

  // Otherwise use height-based logic for card layout
  if (height >= 1100) return 10;
  if (height >= 1000) return 9;
  if (height >= 910) return 8;
  if (height >= 820) return 7;
  if (height >= 730) return 6;
  if (height >= 650) return 5;
  if (height >= 550) return 4;
  return 3; // Default for small heights
};

export default function History({ roomId, onClose }: { roomId: string; onClose?: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [pageSize, setPageSize] = useState(3); // Default to 3
  const [dynamicWidthClasses, setDynamicWidthClasses] = useState("w-[95%] min-[600px]:w-[90%] min-[1028px]:w-[60%]");

  const PAGE_SIZE = pageSize;
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const paginated = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Update page size based on screen dimensions
  useEffect(() => {
    const updatePageSize = () => {
      setPageSize(calculatePageSize(window.innerWidth, window.innerHeight));
    };

    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  // Use paginated results for all devices
  const displayEntries = paginated;

  // Update dynamic width when history changes
  useEffect(() => {
    setDynamicWidthClasses(calculateDynamicWidth(history));
  }, [history]);

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
      if (data) {
        // Convert to array and sort by timestamp desc
        const arr = Object.values(data) as HistoryEntry[];
        arr.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(arr);
      } else {
        setHistory([]);
      }
      setLoading(false);
    });
    return () => off(historyRef, "value", handle);
  }, [roomId]);

  if (loading) {
    return <div className="text-white text-center mt-10">Loading history...</div>;
  }

  if (history.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div
          className={`bg-[#181f2a] rounded-3xl shadow-2xl px-4 sm:px-6 md:px-10 py-4 sm:py-5 ${dynamicWidthClasses} max-w-[1200px] flex flex-col items-center gap-2 sm:gap-3 border-4 border-[#181f2a] max-h-[90vh] overflow-y-auto custom-scrollbar`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-1 mt-1">History</div>
          <div className="text-center text-white">No History Yet</div>
          <button
            className="mt-2 sm:mt-3 bg-[#FFAA00] text-black font-extrabold text-lg sm:text-xl px-8 sm:px-10 py-3 rounded-lg shadow hover:scale-105 transition-transform"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-4 sm:py-5 ${dynamicWidthClasses} max-w-[1200px] flex flex-col items-center gap-2 sm:gap-3 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-1 mt-1">History</div>
        {/* Content */}
        <div className="w-full">
          {/* Mobile Card Layout */}
          <div className="block lg:hidden space-y-3 w-full">
            {displayEntries.map((entry, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-lg px-4 py-1 border border-gray-700 w-full min-w-[300px] min-[500px]:min-w-[400px] sm:min-w-[500px] min-[769px]:min-w-[600px] group"
              >
                <div className="flex justify-between items-center mb-0.5 gap-3">
                  <div
                    className={`font-mono text-base font-medium flex-1 ${
                      entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                    }`}
                    title={entry.displayName}
                  >
                    {entry.userId && users[entry.userId]?.displayName
                      ? users[entry.userId].displayName
                      : entry.displayName}
                  </div>
                  <div
                    className={`font-mono text-base font-medium flex-shrink-0 ${
                      entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-green-400"
                    }`}
                  >
                    {formatDuration(entry.duration)}
                  </div>
                </div>
                <div
                  className={`font-mono text-base leading-snug ${
                    entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-gray-300"
                  }`}
                >
                  <span className="group-hover:hidden min-[600px]:hidden">{truncateText(entry.task, 35)}</span>
                  <span className="hidden min-[600px]:block group-hover:hidden">{entry.task}</span>
                  <span className="hidden group-hover:block whitespace-normal break-words">{entry.task}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-0 min-w-[600px]">
              <thead>
                <tr className="text-gray-400 text-base">
                  <th className="px-2 py-1 w-48">Name</th>
                  <th className="px-2 py-1">Task</th>
                  <th className="pl-8 pr-2 py-1 w-32">Time</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((entry, i) => (
                  <tr key={i} className="group">
                    <td
                      className={`px-2 py-1 font-mono whitespace-nowrap text-base w-48 ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                      title={entry.displayName}
                    >
                      {entry.userId && users[entry.userId]?.displayName
                        ? users[entry.userId].displayName
                        : entry.displayName}
                    </td>
                    <td
                      className={`px-2 py-1 font-mono text-base ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                      title={entry.task}
                    >
                      <span className="group-hover:hidden min-[600px]:hidden">{truncateText(entry.task, 35)}</span>
                      <span className="hidden min-[600px]:block group-hover:hidden">{entry.task}</span>
                      <span className="hidden group-hover:block whitespace-normal break-words">{entry.task}</span>
                    </td>
                    <td
                      className={`pl-8 pr-2 py-1 font-mono whitespace-nowrap text-base w-32 ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-green-400"
                      }`}
                    >
                      {formatDuration(entry.duration)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pagination controls - integrated into modal */}
        {history.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-center gap-4 lg:gap-8">
            <button
              className={`px-2 lg:px-3 py-1.5 w-20 lg:w-28 rounded-md text-sm lg:text-base font-mono transition-colors ${
                page === 1
                  ? "bg-[#181A1B] text-gray-500 cursor-not-allowed"
                  : "bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span className="text-gray-300 text-base lg:text-xl font-mono">
              Page {page} of {totalPages}
            </span>
            <button
              className={`px-2 lg:px-3 py-1.5 w-20 lg:w-28 rounded-md text-sm lg:text-base font-mono transition-colors ${
                page === totalPages
                  ? "bg-[#181A1B] text-gray-500 cursor-not-allowed"
                  : "bg-gray-800 text-gray-200 hover:bg-gray-700"
              }`}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        )}

        {/* Close button */}
        <button
          className="mt-2 sm:mt-3 bg-[#FFAA00] text-black font-extrabold text-lg sm:text-xl px-8 sm:px-10 py-3 rounded-lg shadow hover:scale-105 transition-transform"
          onClick={onClose}
        >
          Close
        </button>
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
          background: #FFAA00;
          border-radius: 4px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff9500;
        }
      `}</style>
    </div>
  );
}
