"use client";

import { InstanceProvider, useInstance } from "./Instances";
import React, { useState, useEffect } from "react";

// Define InstanceType to match the Instances.tsx type
type InstanceType = "public" | "private";

function InstanceJoiner() {
  const { instances, currentInstance, joinInstance, createInstance, leaveInstance } = useInstance();
  const [type, setType] = useState<InstanceType>("public");

  // Leave room on tab close or refresh
  useEffect(() => {
    if (!currentInstance) return;
    const handleUnload = () => leaveInstance();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [currentInstance, leaveInstance]);

  if (currentInstance) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold mb-2">
          In Room: <span className="text-blue-600">{currentInstance.id.slice(-5)}</span>
        </h2>
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {currentInstance.users.map((u) => (
            <span key={u.id} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium shadow-sm">
              {u.displayName}
            </span>
          ))}
        </div>
        <p className="text-gray-500">
          Type: <span className="capitalize">{currentInstance.type}</span>
        </p>
        <button
          className="mt-4 bg-red-500 text-white px-4 py-2 rounded-full font-medium hover:bg-red-600 transition"
          onClick={leaveInstance}
        >
          Leave Room
        </button>
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
            onChange={(e) => setType(e.target.value as InstanceType)}
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

export default function Home() {
  return (
    <InstanceProvider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 p-6">
        <InstanceJoiner />
      </div>
    </InstanceProvider>
  );
}
