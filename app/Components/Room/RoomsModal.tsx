import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, onValue, off, DataSnapshot } from "firebase/database";
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

      // Get private rooms from PrivateRooms in Firebase
      const privateRoomsRef = ref(rtdb, "PrivateRooms");
      const unsubscribe = onValue(privateRoomsRef, async (snapshot) => {
        const roomsData = snapshot.val() || {};
        const userRooms: Room[] = [];

        // Go through all private rooms and find ones the user is in
        for (const [roomId, roomData] of Object.entries(roomsData)) {
          const typedRoomData = roomData as {
            url?: string;
            name?: string;
            users?: Record<string, { displayName: string; joinedAt: number }>;
            userCount?: number;
            createdBy?: string;
            createdAt?: number;
          };

          // Check if user is in this room
          if (typedRoomData.users && typedRoomData.users[user.id]) {
            const userCount = Object.keys(typedRoomData.users || {}).length;
            const roomName = typedRoomData.name || typedRoomData.url?.toUpperCase() || roomId.toUpperCase();
            
            // Check RoomIndex for active workers
            let activeWorkers = 0;
            try {
              const roomIndexRef = ref(rtdb, `RoomIndex/${roomId}`);
              const roomIndexSnapshot = await new Promise<DataSnapshot>((resolve) => {
                onValue(roomIndexRef, (snap) => resolve(snap), { onlyOnce: true });
              });
              
              if (roomIndexSnapshot.exists()) {
                const roomIndexData = roomIndexSnapshot.val();
                activeWorkers = Object.values(roomIndexData || {})
                  .filter((user: unknown) => (user as { isActive?: boolean }).isActive)
                  .length;
              }
            } catch (error) {
              console.error('Error fetching room index:', error);
            }
            
            userRooms.push({
              id: roomId,
              name: roomName,
              url: typedRoomData.url || roomId,
              type: "private",
              lastVisited: typedRoomData.users[user.id].joinedAt || Date.now(),
              totalTime: 0, // History data would need to come from PostgreSQL
              userCount,
              isActive: userCount > 0,
              activeWorkers,
              totalTasks: 0, // History data would need to come from PostgreSQL
              totalRoomTime: 0, // History data would need to come from PostgreSQL
            });
          }
        }

        // Sort by last visited (most recent first)
        userRooms.sort((a, b) => b.lastVisited - a.lastVisited);

        setRooms(userRooms);
        setLoading(false);
      });

      return () => off(privateRoomsRef, "value", unsubscribe);
    };

    loadRooms();
  }, [isOpen, user?.id]);

  // Unused for now - would be used when we fetch actual time data from PostgreSQL
  // const formatTime = (seconds: number) => {
  //   const hours = Math.floor(seconds / 3600);
  //   const minutes = Math.floor((seconds % 3600) / 60);
  //   if (hours > 0) {
  //     return `${hours}h ${minutes}m`;
  //   }
  //   return `${minutes}m`;
  // };

  const handleJoinRoom = (roomUrl: string) => {
    onClose();
    router.push(`/${roomUrl}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm p-4 md:p-0">
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl p-4 md:p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-white">Your Private Rooms</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <DotSpinner size={48} color="#FFF" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-2">No private rooms found</p>
              <p className="text-sm">Create or join a private room to see it here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => {
                const isCurrentRoom = currentInstance?.url === room.url;
                return (
                  <div
                    key={room.id}
                    className={`p-3 md:p-4 rounded-lg transition ${
                      isCurrentRoom
                        ? "bg-blue-900/30 border border-blue-700"
                        : "bg-gray-800 hover:bg-gray-700 cursor-pointer"
                    }`}
                    onClick={() => !isCurrentRoom && handleJoinRoom(room.url)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white text-sm md:text-base truncate">
                            {room.name}
                          </h3>
                          {isCurrentRoom && (
                            <span className="text-xs bg-blue-700 px-2 py-0.5 rounded text-white whitespace-nowrap">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 md:gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            {room.userCount} {room.userCount === 1 ? "user" : "users"}
                          </span>
                          {room.activeWorkers > 0 && (
                            <span className="flex items-center gap-1 text-green-400">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                              {room.activeWorkers} active
                            </span>
                          )}
                        </div>
                      </div>
                      {!isCurrentRoom && (
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}