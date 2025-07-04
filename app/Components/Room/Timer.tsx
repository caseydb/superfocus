"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off, remove } from "firebase/database";

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
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const isInitializedRef = useRef(false);

  // Helper to save timer state to Firebase (only on state changes, not every second)
  const saveTimerState = React.useCallback(
    (isRunning: boolean, baseSeconds: number = 0, taskText?: string) => {
      if (currentInstance && user?.id) {
        const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);
        const now = Date.now();

        if (isRunning) {
          // Store when timer started and base seconds
          set(timerStateRef, {
            running: true,
            startTime: now,
            baseSeconds: baseSeconds, // seconds accumulated before this start
            task: taskText || task || "",
            lastUpdate: now,
          });
          console.log(`💾 DEBUG: Started timer - baseSeconds: ${baseSeconds}`);
        } else {
          // Store paused state with total accumulated seconds
          set(timerStateRef, {
            running: false,
            totalSeconds: baseSeconds,
            task: taskText || task || "",
            lastUpdate: now,
          });
          console.log(`💾 DEBUG: Paused timer - totalSeconds: ${baseSeconds}`);
        }
      }
    },
    [currentInstance, user?.id, task]
  );

  // Helper to clear timer state from Firebase
  const clearTimerState = React.useCallback(() => {
    if (currentInstance && user?.id) {
      const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);
      remove(timerStateRef);
      console.log(`🗑️ DEBUG: Cleared timer state from Firebase`);
    }
  }, [currentInstance, user?.id]);

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

  // Listen for timer state changes from Firebase (for cross-tab sync)
  useEffect(() => {
    if (!currentInstance || !user?.id) {
      isInitializedRef.current = false;
      return;
    }

    const timerStateRef = ref(rtdb, `instances/${currentInstance.id}/userTimers/${user.id}`);

    const handle = onValue(timerStateRef, (snapshot) => {
      const timerState = snapshot.val();

      if (timerState) {
        const isRunning = timerState.running || false;
        let currentSeconds = 0;

        if (isRunning && timerState.startTime) {
          // Calculate current seconds: base + elapsed time since start
          const elapsedMs = Date.now() - timerState.startTime;
          const elapsedSeconds = Math.floor(elapsedMs / 1000);
          currentSeconds = (timerState.baseSeconds || 0) + elapsedSeconds;
        } else {
          // Use stored total seconds when paused
          currentSeconds = timerState.totalSeconds || 0;
        }

        console.log(`📥 DEBUG: Received timer state - ${currentSeconds}s, running: ${isRunning}`);

        // Update local state from Firebase
        setSeconds(currentSeconds);
        setRunning(isRunning);

        // Restore task if it exists and we haven't initialized yet
        if (timerState.task && onTaskRestore && !isInitializedRef.current) {
          onTaskRestore(timerState.task);
        }
      } else if (isInitializedRef.current) {
        // Only reset if we were already initialized (not on first load)
        console.log(`🔄 DEBUG: No timer state found - resetting to 0`);
        setSeconds(0);
        setRunning(false);
      }

      isInitializedRef.current = true;
    });

    return () => {
      off(timerStateRef, "value", handle);
    };
  }, [currentInstance, user?.id, onTaskRestore]);

  // Notify parent of running state
  useEffect(() => {
    if (onActiveChange) onActiveChange(running);
  }, [running, onActiveChange]);

  // Update display every second when running (local only, no Firebase writes)
  useEffect(() => {
    if (running) {
      const interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [running]);

  function handleStart() {
    setRunning(true);
    saveTimerState(true, seconds); // Save start state to Firebase
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
    saveTimerState(false, seconds); // Save paused state to Firebase
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
                clearTimerState(); // Clear Firebase state when completing
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
