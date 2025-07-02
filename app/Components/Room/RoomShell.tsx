"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import Timer from "./Timer";
import ActiveWorkers from "./ActiveWorkers";
import { db } from "../../firebase";
import { ref, set, remove, onDisconnect } from "firebase/database";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, leaveInstance, user } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
        <ActiveWorkers roomId={currentInstance.id} />
        <div className="bg-gray-900/90 rounded-2xl shadow-2xl p-10 w-full max-w-lg flex flex-col items-center gap-8 border-4 border-yellow-500">
          <h2 className="text-3xl font-extrabold text-yellow-400 mb-2">Room: {currentInstance.url}</h2>
          <div className="mb-4">
            <span className="font-bold text-yellow-400">Users:</span>
            {currentInstance.users.map((u) => (
              <span key={u.id} className="ml-2 text-white font-mono">
                {u.displayName}
              </span>
            ))}
          </div>
          <button
            className="bg-yellow-500 text-black px-6 py-2 rounded-full font-bold hover:bg-yellow-400 transition"
            onClick={() => {
              leaveInstance();
              router.push("/");
            }}
          >
            Leave Room
          </button>
          <Timer onActiveChange={handleActiveChange} />
        </div>
      </div>
    );
  }
  return null;
}
