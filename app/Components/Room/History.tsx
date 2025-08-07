//History

import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { fetchHistory } from "../../store/historySlice";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";
import { DotSpinner } from "ldrs/react";
import "ldrs/react/DotSpinner.css";
import { useInstance } from "../Instances";

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // Show date
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}


// Calculate dynamic width based on history content
const calculateDynamicWidth = () => {
  // Fixed width with max-w-[700px] for all screen sizes
  return "w-[95%]";
};

// Calculate PAGE_SIZE based on screen size
const calculatePageSize = (width: number, height: number) => {
  // Since we're now using card layout for all screen sizes with max-width 700px,
  // use consistent height-based logic for pagination
  if (height >= 1100) return 11;
  if (height >= 1000) return 10;
  if (height >= 910) return 9;
  if (height >= 820) return 8;
  if (height >= 730) return 7;
  if (height >= 650) return 6;
  if (height >= 550) return 5;
  return 4; // Default for small heights
};

export default function History({ onClose }: { onClose?: () => void }) {
  const dispatch = useDispatch<AppDispatch>();
  const { currentInstance } = useInstance();

  // Get history from Redux
  const history = useSelector((state: RootState) => state.history.entries);
  const loading = useSelector((state: RootState) => state.history.loading);
  const roomSlug = useSelector((state: RootState) => state.history.roomSlug);

  // Get user data and preferences from Redux
  const currentUser = useSelector((state: RootState) => state.user);
  const savedUserFilter = useSelector((state: RootState) => state.preferences.history_user_filter);
  const savedDateFilter = useSelector((state: RootState) => state.preferences.history_date_filter);

  // Check if current room is public
  const isPublicRoom = currentInstance?.type === "public";

  // Initialize filter states from preferences
  const [showOnlyMine, setShowOnlyMine] = useState(savedUserFilter === "my_tasks");
  const [selectedTimeRange, setSelectedTimeRange] = useState(savedDateFilter || "all_time");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3); // Default to 3
  const [dynamicWidthClasses, setDynamicWidthClasses] = useState("w-[95%] min-[600px]:w-[90%] min-[1028px]:w-[60%]");
  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false);
  const [showPublicToPrivateWarning, setShowPublicToPrivateWarning] = useState(false);

  // Fetch history when component mounts or room changes
  useEffect(() => {
    // Extract slug from URL since that's what the API expects
    const pathParts = window.location.pathname.split("/");
    const urlSlug = pathParts[pathParts.length - 1];

    if (urlSlug && urlSlug !== roomSlug) {
      dispatch(fetchHistory({ 
        slug: urlSlug, 
        isPublicRoom,
        userId: isPublicRoom ? (currentUser.user_id || undefined) : undefined
      }));
    }
  }, [roomSlug, dispatch, isPublicRoom, currentUser.user_id]);

  // Refetch when user filter changes
  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const urlSlug = pathParts[pathParts.length - 1];
    
    if (urlSlug) {
      if (isPublicRoom) {
        // For public rooms, always show only the user's tasks
        dispatch(fetchHistory({ 
          slug: urlSlug, 
          userId: currentUser.user_id || undefined,
          isPublicRoom: true
        }));
      } else {
        // For private rooms, respect the filter
        dispatch(fetchHistory({ 
          slug: urlSlug, 
          userId: showOnlyMine ? (currentUser.user_id || undefined) : undefined,
          isPublicRoom: false
        }));
      }
    }
  }, [showOnlyMine, currentUser.user_id, dispatch, isPublicRoom]);

  // Update local state when preferences change
  useEffect(() => {
    setShowOnlyMine(savedUserFilter === "my_tasks");
  }, [savedUserFilter]);

  useEffect(() => {
    setSelectedTimeRange(savedDateFilter || "all_time");
  }, [savedDateFilter]);

  // Handlers for filter changes
  const handleUserFilterChange = (value: string) => {
    // If switching from private to public, show warning
    if (showOnlyMine && value === "all") {
      setShowPrivacyWarning(true);
      return;
    }

    // If switching from public to private, show warning
    if (!showOnlyMine && value === "mine") {
      setShowPublicToPrivateWarning(true);
      return;
    }

    const filterValue = value === "mine" ? "my_tasks" : "all_tasks";
    setShowOnlyMine(value === "mine");

    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_user_filter", value: filterValue }));
      dispatch(
        updatePreferences({
          userId: currentUser.user_id,
          updates: { history_user_filter: filterValue },
        })
      );
    }
  };

  // Handle privacy warning confirmation (private to public)
  const handlePrivacyConfirm = () => {
    setShowPrivacyWarning(false);
    const filterValue = "all_tasks";
    setShowOnlyMine(false);

    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_user_filter", value: filterValue }));
      dispatch(
        updatePreferences({
          userId: currentUser.user_id,
          updates: { history_user_filter: filterValue },
        })
      );
    }
  };

  // Handle public to private warning confirmation
  const handlePublicToPrivateConfirm = () => {
    setShowPublicToPrivateWarning(false);
    const filterValue = "my_tasks";
    setShowOnlyMine(true);

    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_user_filter", value: filterValue }));
      dispatch(
        updatePreferences({
          userId: currentUser.user_id,
          updates: { history_user_filter: filterValue },
        })
      );
    }
  };

  const handleDateFilterChange = (value: string) => {
    setSelectedTimeRange(value);

    // Update preferences
    if (currentUser?.user_id) {
      dispatch(setPreference({ key: "history_date_filter", value }));
      dispatch(
        updatePreferences({
          userId: currentUser.user_id,
          updates: { history_date_filter: value },
        })
      );
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
          end: getTodayDate(),
        };
      case "this_month":
        return {
          start: getThisMonthStart(),
          end: getTodayDate(),
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
            end: getTodayDate(),
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
    const endDate = new Date(dateRange.end);

    let endTime: number;
    // Check if end date is at midnight (00:00:00)
    if (
      endDate.getHours() === 0 &&
      endDate.getMinutes() === 0 &&
      endDate.getSeconds() === 0
    ) {
      // End date is at midnight - get end of that day (23:59:59.999)
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      endTime = endOfDay.getTime();
    } else {
      // End date already has time component, use as is
      endTime = endDate.getTime();
    }

    return entries.filter((entry) => {
      const entryTime = new Date(entry.completedAt).getTime();
      return entryTime >= startTime && entryTime <= endTime;
    });
  };

  // Apply filters - when showOnlyMine is true, the API already returns only user's tasks
  const userFilteredHistory = history;

  const filteredHistory = filterByDateRange(userFilteredHistory);

  // Calculate total time based on privacy mode
  const calculateTotalTime = () => {
    let totalSeconds = 0;
    
    // In private mode (showOnlyMine=true): total is only user's tasks
    // In public mode (showOnlyMine=false): total is all tasks regardless of privacy
    // Since the API already filters based on showOnlyMine, we just use the filtered history
    const tasksForTotal = filterByDateRange(history);
    const tasksToCalculate = tasksForTotal.filter((entry) => !entry.task.toLowerCase().includes("quit early"));

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn">
        <DotSpinner size="40" speed="0.9" color="#FFAA00" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn" onClick={onClose}>
        <div
          className={`bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-3 sm:py-4 ${dynamicWidthClasses} max-w-[800px] flex flex-col items-center gap-1 sm:gap-2 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar animate-slideUp`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center w-full relative">
            {/* Title on first line */}
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">History</h2>
            {/* Total on second line */}
            <span className="text-sm text-gray-400 font-mono mb-1">
              <span className="text-gray-500">Total:</span> <span className="text-[#FFAA00] font-semibold">0s</span>
            </span>
            {/* Dropdowns on third line */}
            {currentUser?.user_id && (
              <div className="flex items-center gap-2">
                {/* Task Filter Dropdown - Hidden for public rooms */}
                {!isPublicRoom && (
                  <div className="relative">
                    <select
                      className="border border-gray-700 rounded-lg px-2 pr-7 py-1.5 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
                      value={showOnlyMine ? "mine" : "all"}
                      onChange={(e) => handleUserFilterChange(e.target.value)}
                    >
                      <option value="all" className="bg-gray-900 text-gray-100 cursor-pointer">
                        Public Mode
                      </option>
                      <option value="mine" className="bg-gray-900 text-gray-100 cursor-pointer">
                        Private Mode
                      </option>
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
                )}

                {/* Time Range Dropdown */}
                <div className="relative">
                  <select
                    className="border border-gray-700 rounded-lg px-2 pr-7 py-1.5 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
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
            <div className="absolute -top-1 -left-6 hidden md:block">
              <span className="px-2.5 py-1 bg-gray-800 rounded text-xs text-gray-500">⌘H</span>
            </div>
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-2 -right-7 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fadeIn" onClick={onClose}>
      <div
        className={`bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-3 sm:py-4 ${dynamicWidthClasses} max-w-[800px] flex flex-col items-center gap-1 sm:gap-2 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar animate-slideUp`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center w-full relative">
          {/* Title on first line */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">History</h2>
          {/* Total on second line */}
          <span className="text-sm text-gray-400 font-mono mb-1">
            <span className="text-gray-500">Total:</span>{" "}
            <span className="text-[#FFAA00] font-semibold">{totalTime}</span>
          </span>
          {/* Dropdowns on third line */}
          {currentUser?.user_id && (
            <div className="flex items-center gap-2">
              {/* Task Filter Dropdown - Hidden for public rooms */}
              {!isPublicRoom && (
                <div className="relative">
                  <select
                    className="border border-gray-700 rounded-lg px-2 pr-7 py-1.5 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 min-w-[120px] text-center"
                    value={showOnlyMine ? "mine" : "all"}
                    onChange={(e) => handleUserFilterChange(e.target.value)}
                  >
                    <option value="all" className="bg-gray-900 text-gray-100 cursor-pointer">
                      Public Mode
                    </option>
                    <option value="mine" className="bg-gray-900 text-gray-100 cursor-pointer">
                      Private Mode
                    </option>
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
              )}

              {/* Time Range Dropdown */}
              <div className="relative">
                <select
                  className="border border-gray-700 rounded-lg px-3 pr-8 py-1.5 bg-gray-900 text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:border-[#FFAA00] appearance-none cursor-pointer hover:border-gray-600 transition-all duration-200 hover:bg-gray-800 text-center"
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
          <div className="absolute -top-1 -left-6 hidden md:block">
            <span className="px-2.5 py-1 bg-gray-800 rounded text-xs text-gray-500">⌘H</span>
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-7 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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
          <div className="block space-y-2 w-full">
            {displayEntries.map((entry, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-lg px-4 py-1.5 border border-gray-700 w-full min-w-[300px] min-[500px]:min-w-[400px] sm:min-w-[500px] min-[769px]:min-w-[600px] group"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-mono text-sm md:text-base font-medium ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                      title={entry.displayName}
                    >
                      {entry.displayName}
                    </div>
                    <div
                      className={`font-mono text-sm md:text-base leading-snug group/task ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-gray-300"
                      }`}
                    >
                      <span className="block truncate group-hover/task:whitespace-normal group-hover/task:break-words transition-all duration-200">
                        {entry.task}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <div
                      className={`font-mono text-sm md:text-base font-medium ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-green-400"
                      }`}
                    >
                      {entry.formattedDuration}
                    </div>
                    <div className="text-xs text-gray-500">{formatDate(entry.completedAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout - Now hidden since we're using blocks on all sizes */}
          <div className="hidden overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-0 min-w-[600px]">
              <thead>
                <tr className="text-gray-400 text-sm md:text-base">
                  <th className="px-2 py-1 w-48">Name</th>
                  <th className="px-2 py-1">Task</th>
                  <th className="pl-8 pr-2 py-1 w-32">Time</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((entry, i) => (
                  <tr key={i} className="group">
                    <td
                      className={`px-2 py-1 font-mono whitespace-nowrap text-sm md:text-base w-48 ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                      title={entry.displayName}
                    >
                      {entry.displayName}
                    </td>
                    <td
                      className={`px-2 py-1 font-mono text-sm md:text-base group/task ${
                        entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                      }`}
                    >
                      <span className="block truncate group-hover/task:whitespace-normal group-hover/task:break-words transition-all duration-200">{entry.task}</span>
                    </td>
                    <td
                      className={`pl-8 pr-2 py-1 font-mono whitespace-nowrap text-sm md:text-base w-32 ${
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
        {/* Pagination controls - compact and elegant */}
        {filteredHistory.length > PAGE_SIZE && (
          <div className="mt-1 flex items-center justify-center gap-2">
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
      </div>

      {/* Privacy Warning Modal - Private to Public */}
      {showPrivacyWarning && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setShowPrivacyWarning(false);
          }}
        >
          <div 
            className="bg-[#0E1119] rounded-2xl shadow-2xl p-6 max-w-[34rem] mx-4 border border-gray-800 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#FFAA00]/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[#FFAA00]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-[#FFAA00] text-center mb-3">
              Switch to Public Mode?
            </h3>

            {/* Message */}
            <p className="text-gray-300 text-center mb-6 leading-relaxed">
              Your task history will become <span className="text-white font-semibold">visible to all members</span> in this room. 
              Others will be able to see your completed tasks.
            </p>

            {/* Note */}
            <div className="bg-gray-800/50 rounded-lg p-2 mb-6">
              <p className="text-sm text-gray-400 text-center">
                <span className="text-[#FFAA00]">💡</span> You can return to Private Mode at any time to hide all tasks.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPrivacyWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePrivacyConfirm}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#FFAA00] text-black font-bold hover:bg-[#FFB820] transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
              >
                Make Public
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Warning Modal - Public to Private */}
      {showPublicToPrivateWarning && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setShowPublicToPrivateWarning(false);
          }}
        >
          <div 
            className="bg-[#0E1119] rounded-2xl shadow-2xl p-6 max-w-[34rem] mx-4 border border-gray-800 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lock Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#FFAA00]/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[#FFAA00]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-[#FFAA00] text-center mb-3">
              Switch to Private Mode?
            </h3>

            {/* Message */}
            <p className="text-gray-300 text-center mb-6 leading-relaxed">
              Your task details will become <span className="text-white font-semibold">anonymous</span> to other members. 
              They&apos;ll see your name and time, but not what you were working on.
            </p>

            {/* Note */}
            <div className="bg-gray-800/50 rounded-lg p-2 mb-6">
              <p className="text-sm text-gray-400 text-center">
                <span className="text-[#FFAA00]">💡</span> You can return to Public Mode at any time to share task details again.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowPublicToPrivateWarning(false)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePublicToPrivateConfirm}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#FFAA00] text-black font-bold hover:bg-[#FFB820] transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
              >
                Make Private
              </button>
            </div>
          </div>
        </div>
      )}

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
