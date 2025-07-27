import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off } from "firebase/database";
import { useRouter } from "next/navigation";
import { DotSpinner } from 'ldrs/react';
import 'ldrs/react/DotSpinner.css';

interface Room {
  id: string;
  name: string;
  url: string;
  type: "public" | "private";
  lastVisited: number;
  totalTime: number;
  userCount: number;
  isActive: boolean;
  activeWorkers: number;
  totalTasks: number;
  totalRoomTime: number;
}

interface RoomsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RoomsModal({ isOpen, onClose }: RoomsModalProps) {
  const { user, currentInstance } = useInstance();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    if (!isOpen || !user?.id) return;

    const loadRooms = async () => {
      setLoading(true);

      // Get all instances from Firebase and filter for rooms the user has been in
      const instancesRef = ref(rtdb, "instances");
      const unsubscribe = onValue(instancesRef, (snapshot) => {
        const instancesData = snapshot.val() || {};
        const userRooms: Room[] = [];

        // Go through all instances and find private rooms where the user has history
        Object.entries(instancesData).forEach(([instanceId, instanceData]) => {
          const typedInstanceData = instanceData as {
            type?: "public" | "private";
            url?: string;
            users?: Record<string, { id: string; displayName: string }>;
            activeUsers?: Record<string, { id: string; displayName: string }>;
            history?: Record<string, { userId?: string; timestamp?: number; duration?: string }>;
          };

          // Only show private rooms
          if (typedInstanceData.type !== "private") return;

          // Check if user has history in this room and calculate room-wide stats
          let hasHistory = false;
          let lastVisited = 0;
          let totalTime = 0;
          let totalTasks = 0;
          let totalRoomTime = 0;

          if (typedInstanceData.history) {
            Object.values(typedInstanceData.history).forEach((entry) => {
              // Skip quit entries for all calculations
              if (entry.duration && !entry.duration.includes("quit early")) {
                // Calculate room-wide stats (all users)
                totalTasks += 1;

                // Parse duration more accurately
                let entrySeconds = 0;
                if (entry.duration && typeof entry.duration === "string") {
                  const parts = entry.duration.split(":").map(Number);
                  if (parts.length === 3) {
                    // hh:mm:ss format
                    const [h, m, s] = parts;
                    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
                      entrySeconds = h * 3600 + m * 60 + s;
                    }
                  } else if (parts.length === 2) {
                    // mm:ss format
                    const [m, s] = parts;
                    if (!isNaN(m) && !isNaN(s)) {
                      entrySeconds = m * 60 + s;
                    }
                  }
                }
                totalRoomTime += entrySeconds;

                // Check if this entry belongs to current user
                if (entry.userId === user.id) {
                  hasHistory = true;
                  if (entry.timestamp && entry.timestamp > lastVisited) {
                    lastVisited = entry.timestamp;
                  }
                  totalTime += entrySeconds;
                }
              }
            });
          }

          // Also check if user is currently in the room
          if (typedInstanceData.users && typedInstanceData.users[user.id]) {
            hasHistory = true;
            if (!lastVisited) {
              lastVisited = Date.now(); // If no history but user is in room, use current time
            }
          }

          if (hasHistory) {
            const userCount = Object.keys(typedInstanceData.users || {}).length;
            // Count users who are actively working (have running timers)
            const activeWorkers = typedInstanceData.activeUsers ? Object.keys(typedInstanceData.activeUsers).length : 0;
            const roomName = typedInstanceData.url ? typedInstanceData.url.toUpperCase() : instanceId.toUpperCase();
            userRooms.push({
              id: instanceId,
              name: roomName,
              url: typedInstanceData.url || instanceId,
              type: "private",
              lastVisited,
              totalTime,
              userCount,
              isActive: userCount > 0,
              activeWorkers,
              totalTasks,
              totalRoomTime,
            });
          }
        });

        // Sort by last visited (most recent first)
        userRooms.sort((a, b) => b.lastVisited - a.lastVisited);

        setRooms(userRooms);
        setLoading(false);
      });

      return () => off(instancesRef, "value", unsubscribe);
    };

    loadRooms();
  }, [isOpen, user?.id]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleJoinRoom = (roomUrl: string) => {
    onClose();
    router.push(`/${roomUrl}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] border border-gray-800 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <button
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
          <h2 className="text-2xl font-bold text-white mb-2 font-mono">Your Rooms</h2>
          <p className="text-gray-400 text-sm font-mono">All the rooms you&apos;ve joined or created</p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <DotSpinner size="40" speed="0.9" color="#FFAA00" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🏠</div>
              <h3 className="text-xl font-bold text-white mb-2 font-mono">No private rooms found</h3>
              <p className="text-gray-400 font-mono">
                You haven&apos;t joined any private rooms yet. Create or join a private room to get started!
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className={`p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02] cursor-pointer ${
                    room.id === currentInstance?.id
                      ? "border-[#FFAA00] bg-[#FFAA00]/10"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700"
                  }`}
                  onClick={() => handleJoinRoom(room.url)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${room.isActive ? "bg-green-500" : "bg-gray-500"}`}></div>
                        <h3 className="text-lg font-bold text-white font-mono truncate">
                          {room.name}
                          {room.id === currentInstance?.id && (
                            <span className="ml-2 text-sm text-[#FFAA00] font-normal">(Current)</span>
                          )}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-mono ${
                            room.type === "private" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"
                          }`}
                        >
                          {room.type}
                        </span>
                      </div>

                      <div className="text-sm text-gray-400 font-mono">
                        {room.activeWorkers} actively working | {room.totalTasks} tasks this sprint |{" "}
                        {formatTime(room.totalRoomTime)} worked
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {room.id !== currentInstance?.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJoinRoom(room.url);
                          }}
                          className="px-4 py-2 bg-[#FFAA00] text-black font-bold rounded-lg hover:bg-[#ff9900] transition-colors font-mono text-sm cursor-pointer"
                        >
                          Join
                        </button>
                      )}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                        <path
                          d="M9 18l6-6-6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
