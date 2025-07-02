"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import ActiveWorkers from "./ActiveWorkers";
import { db } from "../../firebase";
import { ref, set, remove, push } from "firebase/database";
import TaskInput from "./TaskInput";
import Timer from "./Timer";
import History from "./History";
import Controls from "./Controls";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, leaveInstance, user } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();
  const [task, setTask] = useState("");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerResetKey, setTimerResetKey] = useState(0);
  const timerStartRef = React.useRef<() => void>(null!);
  const [showHistory, setShowHistory] = useState(false);
  const timerSecondsRef = React.useRef<number>(0);
  const [showQuitModal, setShowQuitModal] = useState(false);

  useEffect(() => {
    if (instances.length === 0) return;
    const targetRoom = instances.find((instance) => instance.url === roomUrl);
    if (targetRoom) {
      setRoomFound(true);
      if (!currentInstance || currentInstance.id !== targetRoom.id) {
        joinInstance(targetRoom.id);
      }
    } else {
      setRoomFound(false);
    }
    setLoading(false);
  }, [instances, roomUrl, currentInstance, joinInstance]);

  // Clean up on unmount or room change
  useEffect(() => {
    return () => {
      if (currentInstance && user) {
        const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
        remove(activeRef);
      }
    };
  }, [currentInstance, user]);

  // Track active user status in Firebase RTDB
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
    if (isActive) {
      set(activeRef, { id: user.id, displayName: user.displayName });
      setTimerRunning(true);
    } else {
      remove(activeRef);
      setTimerRunning(false);
    }
  };

  const handleClear = () => {
    if (timerSecondsRef.current > 0 && task.trim()) {
      setShowQuitModal(true);
      return;
    }
    setTask("");
    setTimerRunning(false);
    setTimerResetKey((k) => k + 1);
  };

  const handleQuitConfirm = () => {
    if (timerSecondsRef.current > 0 && currentInstance && user && task.trim()) {
      const hours = Math.floor(timerSecondsRef.current / 3600)
        .toString()
        .padStart(2, "0");
      const minutes = Math.floor((timerSecondsRef.current % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = (timerSecondsRef.current % 60).toString().padStart(2, "0");
      const historyRef = ref(db, `instances/${currentInstance.id}/history`);
      push(historyRef, {
        displayName: user.displayName,
        task: task + " (Quit Early)",
        duration: `${hours}:${minutes}:${secs}`,
        timestamp: Date.now(),
      });
    }
    setTask("");
    setTimerRunning(false);
    setTimerResetKey((k) => k + 1);
    setShowQuitModal(false);
  };

  const handlePushOn = () => {
    setShowQuitModal(false);
  };

  // Complete handler: reset timer, clear input, set inactive
  const handleComplete = (duration: string) => {
    setTask("");
    setTimerRunning(false);
    setTimerResetKey((k) => k + 1);
    if (currentInstance && user) {
      const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
      remove(activeRef);
      // Save to history
      const historyRef = ref(db, `instances/${currentInstance.id}/history`);
      push(historyRef, {
        displayName: user.displayName,
        task,
        duration,
        timestamp: Date.now(),
      });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Loading...</div>;
  }
  if (!roomFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="bg-gray-900/90 rounded-2xl shadow-2xl p-10 w-full max-w-lg flex flex-col items-center gap-8 border-4 border-yellow-500">
          <p className="text-2xl font-bold text-red-400">Room not found.</p>
          <button
            className="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold hover:bg-yellow-400 transition"
            onClick={() => router.push("/")}
          >
            Go to Lobby
          </button>
        </div>
      </div>
    );
  }
  if (currentInstance) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white relative">
        {/* Leave Room button at top center */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <button
            className="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold hover:bg-yellow-400 transition"
            onClick={() => {
              leaveInstance();
              router.push("/");
            }}
          >
            Leave Room
          </button>
        </div>
        {/* User name in top right */}
        <Controls className="fixed top-4 right-8 z-50" />
        <ActiveWorkers roomId={currentInstance.id} />
        {/* Main content: TaskInput or Timer/room UI */}
        {!showHistory ? (
          <div className="flex flex-col items-center justify-center">
            <TaskInput
              task={task}
              setTask={setTask}
              disabled={timerRunning}
              onStart={() => timerStartRef.current && timerStartRef.current()}
            />
            <Timer
              key={timerResetKey}
              onActiveChange={handleActiveChange}
              startRef={timerStartRef}
              onComplete={handleComplete}
              secondsRef={timerSecondsRef}
            />
          </div>
        ) : (
          <History roomId={currentInstance.id} />
        )}
        {/* Bottom bar controls */}
        <button
          className="fixed bottom-4 left-8 z-40 text-gray-500 text-base font-mono underline underline-offset-4 select-none hover:text-blue-400 transition-colors px-2 py-1 bg-transparent border-none cursor-pointer"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? "Back to Room" : "History"}
        </button>
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-yellow-400 transition-colors">
          Leaderboard
        </div>
        <div
          className="fixed bottom-4 right-8 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-red-400 transition-colors"
          onClick={handleClear}
        >
          Clear
        </div>
        {showQuitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="bg-red-600 rounded-2xl shadow-2xl px-6 py-8 flex flex-col items-center gap-6 border-4 border-red-700"
              style={{ minWidth: 350, maxWidth: "90vw" }}
            >
              <div className="text-white text-3xl font-extrabold text-center mb-4">
                Quiting? This will be logged to history.
              </div>
              <div className="flex gap-6 mt-2">
                <button
                  className="bg-white text-red-600 font-bold text-xl px-8 py-3 rounded-lg shadow hover:bg-red-100 transition"
                  onClick={handleQuitConfirm}
                >
                  Quit
                </button>
                <button
                  className="bg-white text-gray-700 font-bold text-xl px-8 py-3 rounded-lg shadow hover:bg-gray-200 transition"
                  onClick={handlePushOn}
                >
                  Push On
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}
