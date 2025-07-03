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
}: {
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  startRef?: React.RefObject<() => void>;
  onComplete?: (duration: string) => void;
  secondsRef?: React.RefObject<number>;
  requiredTask?: boolean;
}) {
  const { currentInstance, user } = useInstance();
  // Use the room ID as a key so timer resets when switching rooms
  const roomKey = currentInstance?.id ?? "no-room";
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const notificationActiveRef = useRef(false);

  // Helper to format time as hh:mm:ss
  function formatTime(s: number) {
    const hours = Math.floor(s / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const secs = (s % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${secs}`;
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
  }, [running]);

  // Reset timer when room changes
  useEffect(() => {
    setSeconds(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    if (!notificationActiveRef.current) {
      document.title = "Locked In";
    }
  }, [roomKey]);

  // Notify parent of running state
  useEffect(() => {
    if (onActiveChange) onActiveChange(running);
  }, [running, onActiveChange]);

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

  // Format as hh:mm:ss
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

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
      <div className="text-4xl mb-2 font-mono">
        {hours}:{minutes}:{secs}
      </div>
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
              onClick={() => onComplete && onComplete(`${hours}:${minutes}:${secs}`)}
            >
              Complete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
