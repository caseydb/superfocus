"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useRouter } from "next/navigation";
import Timer from "./Timer";

export default function RoomShell({ roomUrl }: { roomUrl: string }) {
  const { instances, currentInstance, joinInstance, leaveInstance } = useInstance();
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

  if (loading) {
    return <div>Loading...</div>;
  }
  if (!roomFound) {
    return (
      <div>
        <p>Room not found.</p>
        <button onClick={() => router.push("/")}>Go to Lobby</button>
      </div>
    );
  }
  if (currentInstance) {
    return (
      <div>
        <h2>Room: {currentInstance.url}</h2>
        <div>
          Users:
          {currentInstance.users.map((u) => (
            <span key={u.id}>{u.displayName} </span>
          ))}
        </div>
        <button
          onClick={() => {
            leaveInstance();
            router.push("/");
          }}
        >
          Leave Room
        </button>
        <Timer />
      </div>
    );
  }
  return null;
}
