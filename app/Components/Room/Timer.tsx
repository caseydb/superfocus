"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";

export default function Timer() {
  const { currentInstance } = useInstance();
  // Use the room ID as a key so timer resets when switching rooms
  const roomKey = currentInstance?.id ?? "no-room";
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset timer when room changes
  useEffect(() => {
    setSeconds(0);
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [roomKey]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function handleStart() {
    setRunning(true);
  }
  function handleStop() {
    setRunning(false);
  }
  function handleReset() {
    setSeconds(0);
    setRunning(false);
  }

  // Format as mm:ss
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-4xl font-mono">
        {minutes}:{secs}
      </div>
      <div className="flex gap-2">
        {!running ? (
          <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={handleStart}>
            Start
          </button>
        ) : (
          <button className="bg-yellow-500 text-white px-4 py-2 rounded" onClick={handleStop}>
            Stop
          </button>
        )}
        <button className="bg-gray-300 text-gray-800 px-4 py-2 rounded" onClick={handleReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
