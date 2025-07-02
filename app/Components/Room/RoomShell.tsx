"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import Timer from "./Timer";
import ActiveWorkers from "./ActiveWorkers";
import { db } from "../../firebase";
import { ref, set, remove, onDisconnect } from "firebase/database";
import TaskInput from "./TaskInput";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, leaveInstance, user } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.displayName);
  const [task, setTask] = useState<string | null>(null);

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

  // Handle active user status in Firebase
  const handleActiveChange = (isActive: boolean) => {
    if (!currentInstance || !user) return;
    const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
    if (isActive) {
      set(activeRef, { id: user.id, displayName: user.displayName });
      onDisconnect(activeRef).remove();
    } else {
      remove(activeRef);
    }
  };

  // Clean up on unmount or room change
  useEffect(() => {
    return () => {
      if (currentInstance && user) {
        const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
        remove(activeRef);
      }
    };
  }, [currentInstance, user]);

  // Update activeUsers in Firebase when name changes
  const handleNameChange = async () => {
    if (!currentInstance) return;
    setEditingName(false);
    // Update user context (if possible)
    user.displayName = editedName;
    // Update in Firebase activeUsers
    const activeRef = ref(db, `instances/${currentInstance.id}/activeUsers/${user.id}`);
    set(activeRef, { id: user.id, displayName: editedName });
  };

  const handleLockIn = (taskValue: string) => {
    setTask(taskValue);
    // Optionally: start timer, update Firebase, etc.
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
        <div className="fixed top-4 right-8 z-50">
          {editingName ? (
            <input
              className="bg-black text-gray-200 border-b-2 border-yellow-400 text-lg font-bold outline-none px-2 py-1"
              value={editedName}
              autoFocus
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameChange();
                if (e.key === "Escape") setEditingName(false);
              }}
              maxLength={32}
              style={{ minWidth: 80 }}
            />
          ) : (
            <span
              className="text-lg font-bold text-gray-300 cursor-pointer select-none"
              onClick={() => setEditingName(true)}
            >
              {user.displayName}
            </span>
          )}
        </div>
        <ActiveWorkers roomId={currentInstance.id} />
        {/* Main content: TaskInput or Timer/room UI */}
        {task === null ? (
          <div className="flex flex-col items-center justify-center">
            <TaskInput onLockIn={handleLockIn} />
          </div>
        ) : (
          <div className="w-full max-w-lg flex flex-col items-center gap-8">
            <Timer onActiveChange={handleActiveChange} />
            {/* Add any other room UI here as needed */}
          </div>
        )}
        {/* Bottom bar controls */}
        <div className="fixed bottom-4 left-8 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-blue-400 transition-colors">
          History
        </div>
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-yellow-400 transition-colors">
          Leaderboard
        </div>
        <div className="fixed bottom-4 right-8 z-40 text-gray-500 text-base font-mono cursor-pointer underline underline-offset-4 select-none hover:text-red-400 transition-colors">
          Clear
        </div>
      </div>
    );
  }
  return null;
}
