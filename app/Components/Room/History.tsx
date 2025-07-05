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

// Calculate PAGE_SIZE based on screen size
const calculatePageSize = (width: number, height: number) => {
  // If width >= 1024px (desktop table layout), use 15 items
  if (width >= 1024) return 15;

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
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [pageSize, setPageSize] = useState(3); // Default to 3

  const PAGE_SIZE = pageSize;
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const paginated = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Detect mobile device and screen dimensions
  useEffect(() => {
    const checkDeviceAndDimensions = () => {
      const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 640;
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);

      // Mobile device: has touch, small screen, and mobile user agent
      setIsMobileDevice(hasTouch && isSmallScreen && isMobile);

      // Update page size based on current dimensions
      setPageSize(calculatePageSize(window.innerWidth, window.innerHeight));
    };

    checkDeviceAndDimensions();
    window.addEventListener("resize", checkDeviceAndDimensions);
    return () => window.removeEventListener("resize", checkDeviceAndDimensions);
  }, []);

  // Use all history for mobile devices, paginated for computers
  const displayEntries = isMobileDevice ? history : paginated;

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
      <div className="w-full max-w-none sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto mt-6 sm:mt-10 px-4 sm:px-8">
        <h2 className="text-xl sm:text-2xl font-extrabold text-center text-white mb-4">History</h2>
        {onClose && (
          <div className="flex justify-center mb-4">
            <button
              className="text-gray-400 text-sm sm:text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors bg-transparent border-none cursor-pointer"
              onClick={onClose}
            >
              Back to timer
            </button>
          </div>
        )}
        <div className="text-center text-white">No History Yet</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl mx-auto mt-6 sm:mt-10 px-4 sm:px-8">
      <h2 className="text-xl sm:text-2xl font-extrabold text-center text-white mb-4">History</h2>
      {onClose && (
        <div className="flex justify-center mb-4">
          <button
            className="text-gray-400 text-sm sm:text-base font-mono underline underline-offset-4 select-none hover:text-[#FFAA00] transition-colors bg-transparent border-none cursor-pointer"
            onClick={onClose}
          >
            Back to timer
          </button>
        </div>
      )}
      {/* Content with padding for fixed pagination */}
      <div className={`${history.length > PAGE_SIZE && !isMobileDevice ? "pb-20" : ""}`}>
        {/* Mobile Card Layout */}
        <div className="block lg:hidden space-y-3 w-full">
          {displayEntries.map((entry, i) => (
            <div
              key={i}
              className="bg-[#181A1B] rounded-lg px-4 py-2 border border-[#23272b] w-full min-w-[300px] min-[500px]:min-w-[400px] sm:min-w-[500px] min-[769px]:min-w-[600px]"
            >
              <div className="flex justify-between items-center mb-2 gap-3">
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
                className={`font-mono text-base leading-relaxed ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-gray-300"
                }`}
              >
                {entry.task}
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
                <tr key={i}>
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
                    {entry.task}
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
      {/* Pagination controls - pinned to bottom for all screens (except mobile) */}
      {history.length > PAGE_SIZE && !isMobileDevice && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-50">
          <div className="flex items-center justify-center gap-4 lg:gap-8">
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
        </div>
      )}

      {/* Mobile scroll indicator */}
      {isMobileDevice && history.length > PAGE_SIZE && (
        <div className="text-center mt-4 text-gray-400 text-sm font-mono">Showing all {history.length} entries</div>
      )}
    </div>
  );
}
