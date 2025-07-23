//History

import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";


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
  userId,
  onClose,
}: {
  userId?: string;
  onClose?: () => void;
}) {
  // Get history from Redux
  const history = useSelector((state: RootState) => state.history.entries);
  const loading = useSelector((state: RootState) => state.history.loading);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3); // Default to 3
  const [dynamicWidthClasses, setDynamicWidthClasses] = useState("w-[95%] min-[600px]:w-[90%] min-[1028px]:w-[60%]");
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  // Filter history based on toggle
  const filteredHistory = showOnlyMine && userId ? history.filter((entry) => entry.userId === userId) : history;

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

  // Use paginated results for all devices
  const displayEntries = paginated;

  // Update dynamic width when history changes
  useEffect(() => {
    setDynamicWidthClasses(calculateDynamicWidth());
  }, []);


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
          <div className="flex flex-col items-center w-full mb-1 mt-1 relative">
            <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#FFAA00]">History</div>
            <div className="text-lg text-gray-300 font-mono">Total: 0s</div>
            {userId && (
              <button
                onClick={() => setShowOnlyMine(!showOnlyMine)}
                className={`mt-2 px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                  showOnlyMine ? "bg-[#FFAA00] text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {showOnlyMine ? "My Tasks" : "All Tasks"}
              </button>
            )}
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-10 py-4 sm:py-5 ${dynamicWidthClasses} max-w-[800px] flex flex-col items-center gap-2 sm:gap-3 border border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center w-full mb-1 mt-1 relative">
          <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#FFAA00]">History</div>
          <div className="text-lg text-gray-300 font-mono">Total: {totalTime}</div>
          {userId && (
            <button
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              className={`mt-2 px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                showOnlyMine ? "bg-[#FFAA00] text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {showOnlyMine ? "My Tasks" : "All Tasks"}
            </button>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
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
                className="bg-gray-800 rounded-lg px-4 py-1 border border-gray-700 w-full min-w-[300px] min-[500px]:min-w-[400px] sm:min-w-[500px] min-[769px]:min-w-[600px] group"
              >
                <div className="flex justify-between items-center mb-0.5 gap-3">
                  <div
                    className={`font-mono text-base font-medium flex-1 ${
                      entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                    }`}
                    title={entry.displayName}
                  >
                    {entry.displayName}
                  </div>
                  <div
                    className={`font-mono text-base font-medium flex-shrink-0 ${
                      entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-green-400"
                    }`}
                  >
                    {entry.formattedDuration}
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
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatDate(entry.completedAt)}
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
