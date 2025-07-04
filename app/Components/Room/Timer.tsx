"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off } from "firebase/database";

export default function Timer({
  onActiveChange,
  disabled,
  startRef,
  onComplete,
  secondsRef,
  requiredTask = true,
  task,
  onTaskRestore,
}: {
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  startRef?: React.RefObject<() => void>;
  onComplete?: (duration: string) => void;
  secondsRef?: React.RefObject<number>;
  requiredTask?: boolean;
  task?: string;
  onTaskRestore?: (task: string) => void;
}) {
  const { currentInstance, user } = useInstance();
  // Use the room ID as a key so timer resets when switching rooms
  const roomKey = currentInstance?.id ?? "no-room";
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const notificationActiveRef = useRef(false);

  // Helper to save timer state to localStorage
  const saveTimerState = React.useCallback(
    (secs: number, isRunning: boolean) => {
      if (typeof window !== "undefined" && roomKey !== "no-room") {
        const timerState = {
          seconds: secs,
          running: isRunning,
          task: task || "",
          roomKey: roomKey,
          userId: user?.id,
          timestamp: Date.now(),
        };
        localStorage.setItem("lockedin_timer_state", JSON.stringify(timerState));
      }
    },
    [roomKey, user?.id, task]
  );

  // Helper to load timer state from localStorage
  const loadTimerState = React.useCallback(() => {
    if (typeof window !== "undefined" && roomKey !== "no-room") {
      const saved = localStorage.getItem("lockedin_timer_state");
      if (saved) {
        try {
          const timerState = JSON.parse(saved);
          // Only restore if it's for the same room and user
          if (timerState.roomKey === roomKey && timerState.userId === user?.id) {
            return timerState;
          }
        } catch (e) {
          console.error("Error parsing saved timer state:", e);
        }
      }
    }
    return null;
  }, [roomKey, user?.id]);

  // Helper to clear timer state from localStorage
  const clearTimerState = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("lockedin_timer_state");
    }
  };

  // Helper to format time as mm:ss or hh:mm:ss based on duration
  function formatTime(s: number) {
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (s % 60).toString().padStart(2, "0");

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes}:${secs}`;
    } else {
      return `${minutes}:${secs}`;
    }
  }

  // Live update tab title with timer value when running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    function updateTitle() {
      if (running) {
        document.title = formatTime(seconds);
      } else {
        document.title = "Locked In";
      }
    }
    if (running) {
      interval = setInterval(updateTitle, 1000);
      updateTitle(); // Set immediately
    } else {
      document.title = "Locked In";
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [running, seconds]);

  // Track when timer started for accurate live updates
  const startTimeRef = useRef<number>(Date.now());
  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - seconds * 1000;
    }
  }, [running, seconds]);

  // Load timer state on mount or room change
  useEffect(() => {
    const savedState = loadTimerState();
    if (savedState && savedState.seconds > 0) {
      // Restore timer state but always set running to false (paused)
      setSeconds(savedState.seconds);
      setRunning(false);
      // Restore task if it exists and callback is provided
      if (savedState.task && onTaskRestore) {
        onTaskRestore(savedState.task);
      }
    } else {
      // Reset timer when room changes or no saved state
      setSeconds(0);
      setRunning(false);
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!notificationActiveRef.current) {
      document.title = "Locked In";
    }
  }, [roomKey, loadTimerState, onTaskRestore]);

  // Notify parent of running state
  useEffect(() => {
    if (onActiveChange) onActiveChange(running);
  }, [running, onActiveChange]);

  // Save timer state when it changes
  useEffect(() => {
    if (seconds > 0 || running) {
      saveTimerState(seconds, running);
    }
  }, [seconds, running, saveTimerState]);

  // Handle browser close/refresh to pause timer and save state
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (running || seconds > 0) {
        saveTimerState(seconds, false); // Always save as paused
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [seconds, running, saveTimerState]);

  useEffect(() => {
    if (running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  function handleStart() {
    setRunning(true);
    notifyEvent("start");
  }

  // Add event notification for start, complete, and quit
  function notifyEvent(type: "start" | "complete" | "quit") {
    if (currentInstance) {
      const lastEventRef = ref(rtdb, `instances/${currentInstance.id}/lastEvent`);
      set(lastEventRef, { displayName: user.displayName, type, timestamp: Date.now() });
    }
  }

  function handleStop() {
    setRunning(false);
  }

  // Expose handleStart to parent via ref
  React.useEffect(() => {
    if (startRef) {
      startRef.current = handleStart;
    }
  });

  // Update secondsRef with the current seconds value
  React.useEffect(() => {
    if (secondsRef) secondsRef.current = seconds;
  }, [seconds, secondsRef]);

  // Listen for event notifications (🥊🏆💀)
  useEffect(() => {
    if (!currentInstance) return;
    const lastEventRef = ref(rtdb, `instances/${currentInstance.id}/lastEvent`);
    let timeout: NodeJS.Timeout | null = null;
    let firstRun = true;
    const handle = onValue(lastEventRef, (snap) => {
      if (firstRun) {
        firstRun = false;
        return;
      }
      const val = snap.val();
      if (val && val.displayName && val.type) {
        let emoji = "";
        if (val.type === "start") emoji = "🥊";
        if (val.type === "complete") emoji = "🏆";
        if (val.type === "quit") emoji = "💀";
        document.title = `${emoji} ${val.displayName}`;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          // Resume timer or default title immediately after notification
          if (running) {
            document.title = formatTime(seconds);
          } else {
            document.title = "Locked In";
          }
        }, 5000);
      }
    });
    return () => {
      off(lastEventRef, "value", handle);
      if (timeout) clearTimeout(timeout);
    };
  }, [currentInstance, running, seconds]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-4xl mb-2 font-mono">{formatTime(seconds)}</div>
      <div className="flex gap-4">
        {!running ? (
          <button
            className="bg-white text-black font-extrabold text-2xl px-12 py-4 rounded-xl shadow-lg transition hover:scale-105 disabled:opacity-40"
            onClick={handleStart}
            disabled={disabled || !requiredTask}
          >
            Start
          </button>
        ) : (
          <>
            <button
              className="bg-white text-black font-extrabold text-2xl px-12 py-4 w-48 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40"
              onClick={handleStop}
            >
              Pause
            </button>
            <button
              className="bg-green-500 text-white font-extrabold text-2xl px-12 py-4 w-48 rounded-xl shadow-lg transition hover:scale-102 disabled:opacity-40"
              onClick={() => {
                clearTimerState(); // Clear saved state when completing
                if (onComplete) {
                  onComplete(formatTime(seconds));
                }
              }}
            >
              Complete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
