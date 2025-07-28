//History

import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { fetchHistory } from "../../store/historySlice";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";
import { DotSpinner } from 'ldrs/react';
import 'ldrs/react/DotSpinner.css';


function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // Show date
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  }
}

// Truncate text to specified length
const truncateText = (text: string, maxLength: number = 50) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

// Calculate dynamic width based on history content
const calculateDynamicWidth = () => {
  // Fixed width with max-w-[700px] for all screen sizes
  return "w-[95%]";
};

// Calculate PAGE_SIZE based on screen size
const calculatePageSize = (width: number, height: number) => {
  // Since we're now using card layout for all screen sizes with max-width 700px,
  // use consistent height-based logic for pagination
  if (height >= 1100) return 10;
  if (height >= 1000) return 9;
  if (height >= 910) return 8;
  if (height >= 820) return 7;
  if (height >= 730) return 6;
  if (height >= 650) return 5;
  if (height >= 550) return 4;
  return 3; // Default for small heights
};

export default function History({
  onClose,
}: {
  onClose?: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  
  // Get history from Redux
  const history = useSelector((state: RootState) => state.history.entries);
  const loading = useSelector((state: RootState) => state.history.loading);
  const roomSlug = useSelector((state: RootState) => state.history.roomSlug);
  
  // Fetch history when component mounts or room changes
  useEffect(() => {
    // Extract slug from URL since that's what the API expects
    const pathParts = window.location.pathname.split('/');
    const urlSlug = pathParts[pathParts.length - 1];
    
    if (urlSlug && urlSlug !== roomSlug) {
      dispatch(fetchHistory(urlSlug));
    }
  }, [roomSlug, dispatch]);
  
  // Console log the history state only when it changes
  useEffect(() => {
    console.log("[History Component] Full Redux history state:", {
      entries: history,
      loading,
      totalEntries: history.length,
      roomSlug,
      entriesByUser: history.reduce((acc, entry) => {
        const userId = entry.userId || 'unknown';
        if (!acc[userId]) acc[userId] = [];
        acc[userId].push(entry);
        return acc;
      }, {} as Record<string, typeof history>)
    });
  }, [history, loading, roomSlug]);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3); // Default to 3
  const [dynamicWidthClasses, setDynamicWidthClasses] = useState("w-[95%] min-[600px]:w-[90%] min-[1028px]:w-[60%]");

  // Get user data and preferences from Redux
  const currentUser = useSelector((state: RootState) => state.user);
  const savedUserFilter = useSelector((state: RootState) => state.preferences.history_user_filter);
  const savedDateFilter = useSelector((state: RootState) => state.preferences.history_date_filter);
  
  // Initialize filter states from preferences
  const [showOnlyMine, setShowOnlyMine] = useState(savedUserFilter === "my_tasks");
  const [selectedTimeRange, setSelectedTimeRange] = useState(savedDateFilter || "all_time");

  // Update local state when preferences change
  useEffect(() => {
    setShowOnlyMine(savedUserFilter === "my_tasks");
  }, [savedUserFilter]);

  useEffect(() => {
    setSelectedTimeRange(savedDateFilter || "all_time");
  }, [savedDateFilter]);

  // Handlers for filter changes
  const handleUserFilterChange = (value: string) => {
    const filterValue = value === "mine" ? "my_tasks" : "all_tasks";
    setShowOnlyMine(value === "mine");
    
    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_user_filter", value: filterValue }));
      dispatch(updatePreferences({ 
        userId: currentUser.user_id, 
        updates: { history_user_filter: filterValue } 
      }));
    }
  };

  const handleDateFilterChange = (value: string) => {
    setSelectedTimeRange(value);
    
    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_date_filter", value }));
      dispatch(updatePreferences({ 
        userId: currentUser.user_id, 
        updates: { history_date_filter: value } 
      }));
    }
  };

  // Time range options matching Analytics component
  const TIME_RANGES = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "this_week" },
    { label: "This Month", value: "this_month" },
    { label: "Last 7 days", value: "7_days" },
    { label: "Last 14 days", value: "14_days" },
    { label: "Last 30 days", value: "30_days" },
    { label: "Last 90 days", value: "90_days" },
    { label: "Last 365 days", value: "365_days" },
    { label: "All Time", value: "all_time" },
  ];
  
  // Helper function to get date range based on selected time range
  const getDateRange = (timeRange: string): { start: Date | null; end: Date | null } => {
    const getTodayDate = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getDateNDaysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getThisWeekStart = () => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getThisMonthStart = () => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    switch (timeRange) {
      case "today":
        const today = getTodayDate();
        return { start: today, end: today };
      case "this_week":
        return {
          start: getThisWeekStart(),
          end: getTodayDate()
        };
      case "this_month":
        return {
          start: getThisMonthStart(),
          end: getTodayDate()
        };
      case "7_days":
      case "14_days":
      case "30_days":
      case "90_days":
      case "365_days":
        const daysMatch = timeRange.match(/^(\d+)_days$/);
        if (daysMatch) {
          const days = Number(daysMatch[1]);
          return {
            start: getDateNDaysAgo(days),
            end: getTodayDate()
          };
        }
        return { start: null, end: null };
      case "all_time":
      default:
        return { start: null, end: null };
    }
  };

  // Filter by date range
  const filterByDateRange = (entries: typeof history) => {
    if (selectedTimeRange === "all_time") return entries;
    
    const dateRange = getDateRange(selectedTimeRange);
    if (!dateRange.start || !dateRange.end) return entries;

    const startTime = dateRange.start.getTime();
    
    // For single day selection, get end of that day
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    let endTime: number;
    if (
      startDate.toDateString() === endDate.toDateString() &&
      endDate.getHours() === 0 &&
      endDate.getMinutes() === 0 &&
      endDate.getSeconds() === 0
    ) {
      // Same day at midnight - get end of this day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      endTime = endOfDay.getTime();
    } else {
      // Different days - add 24 hours to include full end day
      endTime = dateRange.end.getTime() + (24 * 60 * 60 * 1000 - 1);
    }

    return entries.filter((entry) => {
      const entryTime = new Date(entry.completedAt).getTime();
      return entryTime >= startTime && entryTime <= endTime;
    });
  };
  
  // Apply filters - first by user, then by date
  const userFilteredHistory = showOnlyMine && currentUser?.user_id 
    ? history.filter(entry => entry.userId === currentUser.user_id)
    : history;
    
  const filteredHistory = filterByDateRange(userFilteredHistory);

  // Calculate total time for filtered tasks (excluding quit tasks)
  const calculateTotalTime = () => {
    let totalSeconds = 0;
    const tasksToCalculate = filteredHistory.filter((entry) => !entry.task.toLowerCase().includes("quit early"));

    tasksToCalculate.forEach((entry) => {
      totalSeconds += entry.duration;
    });

    // Format total time
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const totalTime = calculateTotalTime();

  const PAGE_SIZE = pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const paginated = filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Update page size based on screen dimensions
  useEffect(() => {
    const updatePageSize = () => {
      setPageSize(calculatePageSize(window.innerWidth, window.innerHeight));
    };

    updatePageSize();
    window.addEventListener("resize", updatePageSize);
    return () => window.removeEventListener("resize", updatePageSize);
  }, []);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [showOnlyMine, selectedTimeRange]);

  // Use paginated results for all devices
  const displayEntries = paginated;

  // Update dynamic width when history changes
  useEffect(() => {
    setDynamicWidthClasses(calculateDynamicWidth());
  }, []);


  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <DotSpinner size="40" speed="0.9" color="#FFAA00" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
        <div
          className={`bg-[#181f2a] rounded-3xl shadow-2xl px-4 sm:px-6 md:px-10 py-4 sm:py-5 ${dynamicWidthClasses} max-w-[1200px] flex flex-col items-center gap-2 sm:gap-3 border-4 border-[#181f2a] max-h-[90vh] overflow-y-auto custom-scrollbar`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center w-full mb-1 mt-1 relative">
            <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#FFAA00]">History</div>
            <div className="text-lg text-gray-300 font-mono">Total: 0s</div>
            {currentUser?.user_id && (
              <div className="flex items-center gap-2 mt-2">
                {/* Task Filter Dropdown */}
                <div className="relative">
                  <select
                    className="border border-gray-700 rounded-lg px-2 pr-7 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
                    value={showOnlyMine ? "mine" : "all"}
                    onChange={(e) => handleUserFilterChange(e.target.value)}
                  >
                    <option value="all" className="bg-gray-900 text-gray-100 cursor-pointer">All Tasks</option>
                    <option value="mine" className="bg-gray-900 text-gray-100 cursor-pointer">My Tasks</option>
                  </select>
                  {/* Custom Chevron Icon */}
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                
                {/* Time Range Dropdown */}
                <div className="relative">
                  <select
                    className="border border-gray-700 rounded-lg px-2 pr-7 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
                    value={selectedTimeRange}
                    onChange={(e) => handleDateFilterChange(e.target.value)}
                  >
                    {TIME_RANGES.map((r) => (
                      <option key={r.value} value={r.value} className="bg-gray-900 text-gray-100 cursor-pointer">
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {/* Custom Chevron Icon */}
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
            {/* Keyboard Shortcut Tip */}
            <div className="absolute -top-3 -left-5">
              <span className="px-2.5 py-1 bg-gray-800 rounded text-xs text-gray-500">⌘H</span>
            </div>
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
          </div>
          <div className="text-center text-white">No History Yet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95" onClick={onClose}>
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-4 sm:py-5 ${dynamicWidthClasses} max-w-[800px] flex flex-col items-center gap-2 sm:gap-3 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center w-full mb-1 mt-1 relative">
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#FFAA00]">History</div>
          <div className="text-lg text-gray-300 font-mono">Total: {totalTime}</div>
          {currentUser?.user_id && (
            <div className="flex items-center gap-2 mt-2">
              {/* Task Filter Dropdown */}
              <div className="relative">
                <select
                  className="border border-gray-700 rounded-lg px-2 pr-7 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
                  value={showOnlyMine ? "mine" : "all"}
                  onChange={(e) => handleUserFilterChange(e.target.value)}
                >
                  <option value="all" className="bg-gray-900 text-gray-100 cursor-pointer">All Tasks</option>
                  <option value="mine" className="bg-gray-900 text-gray-100 cursor-pointer">My Tasks</option>
                </select>
                {/* Custom Chevron Icon */}
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {/* Time Range Dropdown */}
              <div className="relative">
                <select
                  className="border border-gray-700 rounded-lg px-3 pr-8 py-2 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 text-center"
                  value={selectedTimeRange}
                  onChange={(e) => handleDateFilterChange(e.target.value)}
                >
                  {TIME_RANGES.map((r) => (
                    <option key={r.value} value={r.value} className="bg-gray-900 text-gray-100 cursor-pointer">
                      {r.label}
                    </option>
                  ))}
                </select>
                {/* Custom Chevron Icon */}
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
          {/* Keyboard Shortcut Tip */}
          <div className="absolute -top-3 -left-5">
            <span className="px-2.5 py-1 bg-gray-800 rounded text-xs text-gray-500">⌘H</span>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
        </div>
        {/* Content */}
        <div className="w-full">
          {/* Card/Blocks Layout - Now shown on all screen sizes */}
          <div className="block space-y-3 w-full">
            {displayEntries.map((entry, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-lg px-4 py-2 border border-gray-700 w-full min-w-[300px] min-[500px]:min-w-[400px] sm:min-w-[500px] min-[769px]:min-w-[600px] group"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div
                      className={`font-mono text-base font-medium ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                      title={entry.displayName}
                    >
                      {entry.displayName}
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
                  <div className="flex flex-col items-end flex-shrink-0">
                    <div
                      className={`font-mono text-base font-medium ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-green-400"
                      }`}
                    >
                      {entry.formattedDuration}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(entry.completedAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout - Now hidden since we're using blocks on all sizes */}
          <div className="hidden overflow-x-auto">
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
                      {entry.displayName}
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
                      {entry.formattedDuration}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pagination controls - integrated into modal */}
        {filteredHistory.length > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-center gap-4 lg:gap-8">
            <button
              className={`px-2 lg:px-3 py-1.5 w-20 lg:w-28 rounded-md text-sm lg:text-base font-mono transition-colors ${
                page === 1
                  ? "bg-[#181A1B] text-gray-500 cursor-not-allowed"
                  : "bg-gray-800 text-gray-200 hover:bg-gray-700 cursor-pointer"
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
                  : "bg-gray-800 text-gray-200 hover:bg-gray-700 cursor-pointer"
              }`}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
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
    </div>
  );
}
