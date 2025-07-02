"use client";
import React, { useEffect, useRef, useState } from "react";
import { useInstance } from "../../Components/Instances";

export default function Timer({
  onActiveChange,
  disabled,
}: // task,
{
  onActiveChange?: (isActive: boolean) => void;
  disabled?: boolean;
  // task?: string;
}) {
  const { currentInstance } = useInstance();
  // Use the room ID as a key so timer resets when switching rooms
  const roomKey = currentInstance?.id ?? "no-room";
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset timer when room changes
  useEffect(() => {
    setSeconds(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
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
            disabled={disabled}
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
              onClick={handleStop}
            >
              Complete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
