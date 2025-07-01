"use client";

import { InstanceProvider, useInstance } from "../Instances";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RoomPageProps {
  params: {
    roomUrl: string;
  };
}

function RoomJoiner({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, leaveInstance } = useInstance();
  const [loading, setLoading] = useState(true);
  const [roomFound, setRoomFound] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (instances.length === 0) return; // Wait for instances to load

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

  if (loading) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Looking for room...</p>
      </div>
    );
  }

  if (!roomFound) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Room Not Found</h2>
        <p className="text-gray-600 text-center mb-4">
          The room <span className="font-mono bg-gray-100 px-2 py-1 rounded">{roomUrl}</span> does not exist or has been
          deleted.
        </p>
        <button
          className="bg-blue-500 text-white px-6 py-2 rounded-full font-medium hover:bg-blue-600 transition"
          onClick={() => router.push("/")}
        >
          Go to Lobby
        </button>
      </div>
    );
  }

  if (currentInstance) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold mb-2">
          Room: <span className="text-blue-600">{currentInstance.url}</span>
        </h2>
        <div className="text-sm text-gray-500 mb-2">
          Share this URL: <span className="font-mono bg-gray-100 px-2 py-1 rounded">/{currentInstance.url}</span>
        </div>
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
        <div className="flex gap-2">
          <button
            className="bg-red-500 text-white px-4 py-2 rounded-full font-medium hover:bg-red-600 transition"
            onClick={() => {
              leaveInstance();
              router.push("/");
            }}
          >
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function RoomPage({ params }: RoomPageProps) {
  return (
    <InstanceProvider>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 p-6">
        <RoomJoiner roomUrl={params.roomUrl} />
      </div>
    </InstanceProvider>
  );
}
