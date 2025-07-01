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
        <ActiveWorkers roomId={currentInstance.id} />
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
        <Timer onActiveChange={handleActiveChange} />
      </div>
    );
  }
  return null;
}
