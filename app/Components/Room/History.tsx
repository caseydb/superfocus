//History

import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { ref, onValue, off } from "firebase/database";

interface HistoryEntry {
  displayName: string;
  task: string;
  duration: string;
  timestamp: number;
}

export default function History({ roomId }: { roomId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const paginated = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (!roomId) return;
    const historyRef = ref(db, `instances/${roomId}/history`);
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
      <div className="w-[820px] mx-auto mt-10">
        <h2 className="text-2xl font-extrabold text-center text-white mb-4">No History Yet</h2>
      </div>
    );
  }

  return (
    <div className="w-[820px] mx-auto mt-10">
      <h2 className="text-2xl font-extrabold text-center text-white mb-4">History</h2>
      <table className="w-full text-left border-separate border-spacing-y-0">
        <thead>
          <tr className="text-gray-400 text-base">
            <th className="px-1">Name</th>
            <th className="px-1">Task</th>
            <th className="px-1">Time</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((entry, i) => (
            <tr key={i}>
              <td
                className={`px-1 py-0.5 font-mono whitespace-nowrap ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                }`}
                title={entry.displayName}
              >
                {entry.displayName}
              </td>
              <td
                className={`px-1 py-0.5 font-mono ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                }`}
                title={entry.task}
              >
                {entry.task.length > 50 ? entry.task.slice(0, 50) + "..." : entry.task}
              </td>
              <td
                className={`px-1 py-0.5 font-mono ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                }`}
              >
                {entry.duration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Pagination controls */}
      {history.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-8 mt-8">
          <button
            className={`px-3 py-1.5 w-28 rounded-md text-base font-mono transition-colors ${
              page === 1
                ? "bg-[#181A1B] text-gray-500 cursor-not-allowed"
                : "bg-gray-800 text-gray-200 hover:bg-gray-700"
            }`}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-gray-300 text-xl font-mono">
            Page {page} of {totalPages}
          </span>
          <button
            className={`px-3 py-1.5 w-28 rounded-md text-base font-mono transition-colors ${
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
  );
}
