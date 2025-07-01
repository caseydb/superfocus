"use client";

import { useInstance } from "../Components/Instances";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Lobby() {
  const { instances, currentInstance, joinInstance, createInstance, leaveInstance } = useInstance();
  const [type, setType] = useState<"public" | "private">("public");
  const router = useRouter();

  // Redirect to room URL when joining a room
  useEffect(() => {
    if (currentInstance) {
      router.push(`/${currentInstance.url}`);
    }
  }, [currentInstance, router]);

  // Leave room on tab close or refresh
  useEffect(() => {
    if (!currentInstance) return;
    const handleUnload = () => leaveInstance();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [currentInstance, leaveInstance]);

  // If user is in a room, they should be redirected to the room URL
  if (currentInstance) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Redirecting to room...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-6">
      <button
        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold py-2 px-6 rounded-full shadow-lg hover:scale-105 transition mb-2"
        onClick={() => {
          const available = instances.find((i) => i.users.length < 5 && i.type === "public");
          if (available) {
            joinInstance(available.id);
          } else {
            createInstance("public");
          }
        }}
      >
        🚀 Quick Join
      </button>
      <div className="w-full">
        <h3 className="text-lg font-semibold mb-2">Active Rooms</h3>
        <ul className="space-y-2">
          {instances.length === 0 && <li className="text-gray-400">No rooms yet.</li>}
          {instances.map((instance) => (
            <li key={instance.id} className="flex items-center justify-between bg-gray-100 rounded-lg px-4 py-2">
              <div>
                <span className="font-bold text-blue-700">{instance.type.toUpperCase()}</span>
                <span className="ml-2 text-gray-600">({instance.users.length}/5)</span>
                <div className="text-xs text-gray-500">/{instance.url}</div>
              </div>
              <button
                className="bg-blue-500 text-white px-3 py-1 rounded-full font-medium hover:bg-blue-600 transition"
                onClick={() => joinInstance(instance.id)}
              >
                Join
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="w-full flex flex-col items-center gap-2">
        <h3 className="text-lg font-semibold">Create a Room</h3>
        <div className="flex gap-2">
          <select
            className="border rounded px-2 py-1"
            value={type}
            onChange={(e) => setType(e.target.value as "public" | "private")}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <button
            className="bg-green-500 text-white px-4 py-1 rounded-full font-medium hover:bg-green-600 transition"
            onClick={() => createInstance(type)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
