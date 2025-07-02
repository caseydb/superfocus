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

  return (
    <div className="w-full max-w-3xl mx-auto mt-16">
      <h2 className="text-3xl font-extrabold text-center text-white mb-8">History</h2>
      <table className="w-full text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-gray-400 text-lg">
            <th className="px-4">Name</th>
            <th className="px-4">Task</th>
            <th className="px-4">Time</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, i) => (
            <tr key={i}>
              <td className="px-4 text-white font-mono whitespace-nowrap">{entry.displayName}</td>
              <td
                className={`px-4 font-mono ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                }`}
              >
                {entry.task}
              </td>
              <td
                className={`px-4 font-mono ${
                  entry.task.toLowerCase().includes("quit") ? "text-red-500" : "text-white"
                }`}
              >
                {entry.duration}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.length === 0 && <div className="text-gray-400 text-center mt-8">No history yet.</div>}
    </div>
  );
}
