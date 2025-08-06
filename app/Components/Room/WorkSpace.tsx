"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";
import { PresenceService } from "@/app/utils/presenceService";
import { rtdb } from "@/lib/firebase";
import { ref, onValue, off } from "firebase/database";
import { roomService } from "@/app/services/roomService";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface WorkSpaceProps {
  onClose: () => void;
}

type TabType = "experiment" | "team";

interface RoomMember {
  id: string;
  name: string;
  avatar: string;
  status: "online" | "idle" | "offline";
  task?: string;
  duration?: string;
}

interface Room {
  id: string;
  name: string;
  url: string;
  type: "public" | "private";
  members: RoomMember[];
  activeCount: number;
  weeklyStats: {
    totalTime: string;
    totalTasks: number;
  };
  description?: string;
  createdBy?: string;
  isPinned?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  admins?: string[];
  maxMembers?: number;
  isEphemeral?: boolean;
  firebaseId?: string;
  firebase_id?: string; // Alternative field name from workspaceSlice
}

// Sortable Room Card Component
interface SortableRoomCardProps {
  room: Room;
  currentRoomUrl: string;
  onJoinRoom: (url: string) => void;
  onSettingsClick: (room: Room) => void;
  activeCount?: number;
  roomUsers?: Array<{userId: string; firstName?: string; lastName?: string; picture?: string | null; isActive: boolean}>;
}

const SortableRoomCard: React.FC<SortableRoomCardProps> = ({ room, currentRoomUrl, onJoinRoom, onSettingsClick, activeCount, roomUsers }) => {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: room.id,
    animateLayoutChanges: () => true,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 999 : "auto",
    willChange: isDragging ? "transform" : "auto",
    position: isDragging ? "relative" : "static",
  } as React.CSSProperties;

  // Check if this is the current room (handle both with and without leading slash)
  const isCurrentRoom = currentRoomUrl === room.url || 
                       currentRoomUrl === room.url.replace(/^\//, '') || 
                       `/${currentRoomUrl}` === room.url;
  
  // Debug logging removed to prevent infinite loop

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 bg-gray-800/50 rounded-lg border transition-all duration-200 group flex flex-col min-h-[180px] ${
        isCurrentRoom ? "border-[#FFAA00] bg-gray-800/70" : "border-gray-700 hover:border-gray-600"
      } ${isDragging ? "shadow-2xl shadow-[#FFAA00]/20" : ""}`}
    >
      {/* Room Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-200">{room.name}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                room.isEphemeral || room.id.startsWith('ephemeral-')
                  ? "bg-green-500/20 text-green-400" 
                  : room.type === "private" 
                  ? "bg-purple-500/20 text-purple-400" 
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {room.isEphemeral || room.id.startsWith('ephemeral-') ? "Temporary" : room.type === "private" ? "Private" : "Public"}
            </span>
          </div>
          {/* Elegant URL display */}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="font-mono text-xs">locked-in{room.url.startsWith('/') ? room.url : `/${room.url}`}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          {/* Settings Menu - Available for all users */}
          <div className="relative group/menu">
            <button
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onSettingsClick(room);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          {/* Quick Stats */}
          <div className="text-right text-xs text-gray-500">
            <div className="font-medium text-gray-400">{room.weeklyStats?.totalTime || 'Null'}</div>
            <div>{room.weeklyStats?.totalTasks || 0} tasks</div>
            <div className="text-[10px] mt-1">last 30 days</div>
          </div>
        </div>
      </div>

      {/* Content Section - Flex grow to push button down */}
      <div className="flex-1">
        {/* Active Members */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex -space-x-2">
            {(() => {
              const displayItems = [];
              const users = roomUsers || [];
              const maxVisible = 5;
              const hasOverflow = users.length > maxVisible;
              const membersToShow = hasOverflow ? 4 : users.length;

              // Sort users by status: active first, then idle
              const sortedUsers = [...users].sort((a, b) => {
                if (a.isActive && !b.isActive) return -1;
                if (!a.isActive && b.isActive) return 1;
                return 0;
              });

              // Add member avatars
              for (let i = 0; i < membersToShow; i++) {
                const user = sortedUsers[i];
                const firstName = user.firstName || '';
                const lastName = user.lastName || '';
                const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
                const displayInitials = initials.trim() || 'U';
                const fullName = `${firstName} ${lastName}`.trim() || 'Unknown User';
                
                
                displayItems.push(
                  <div
                    key={user.userId}
                    className="relative"
                    title={`${fullName}${user.isActive ? ' - Active' : ' - Idle'}`}
                  >
                    {user.picture && user.picture.trim() !== '' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.picture}
                        alt={fullName}
                        className="w-8 h-8 rounded-full border-2 border-gray-900 object-cover"
                        onError={(e) => {
                          // If image fails to load, hide it and show initials instead
                          const imgElement = e.currentTarget;
                          const parent = imgElement.parentElement;
                          if (parent) {
                            // Replace img with initials div
                            parent.innerHTML = `<div class="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200">${displayInitials}</div>`;
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200"
                      >
                        {displayInitials}
                      </div>
                    )}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                        user.isActive ? 'bg-green-500 animate-sync-pulse' : 'bg-yellow-500'
                      }`}
                    />
                  </div>
                );
              }

              // Add overflow indicator
              if (hasOverflow) {
                const overflowCount = users.length - 4;
                displayItems.push(
                  <div key="overflow" className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-900 bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-400">
                      {overflowCount > 99 ? "99+" : `+${overflowCount}`}
                    </div>
                  </div>
                );
              }

              return displayItems;
            })()}
          </div>
          <span className="text-sm text-gray-400">
            {activeCount && activeCount > 0 ? (
              <span className="text-green-400">{activeCount} actively working</span>
            ) : roomUsers && roomUsers.length > 0 ? (
              <span className="text-gray-500">No one actively working</span>
            ) : (
              <span className="text-gray-500">This room is empty</span>
            )}
          </span>
        </div>
      </div>

      {/* Join Button - Always at bottom */}
      <button
        onClick={() => onJoinRoom(room.url)}
        className={`w-full py-1.5 rounded-lg font-medium transition-all duration-200 ${
          isCurrentRoom
            ? "bg-gray-700 text-gray-400 cursor-default"
            : "bg-gray-700 text-gray-300 hover:bg-[#FFAA00] hover:text-black"
        }`}
        disabled={isCurrentRoom}
      >
        {isCurrentRoom ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-sync-pulse" />
            Current Room
          </span>
        ) : (
          "Join Room"
        )}
      </button>
    </div>
  );
};

// Mock friends data for profile modal
const MOCK_FRIENDS = [
  {
    id: "1",
    name: "Alex Chen",
    firstName: "Alex",
    lastName: "Chen",
    status: "online" as const,
    currentTask: "Building React components",
    lastMessage: "Hey, can you review my PR?",
    avatar: "AC",
    mutualFriends: 15,
  },
  {
    id: "2",
    name: "Sarah Johnson",
    firstName: "Sarah",
    lastName: "Johnson",
    status: "online" as const,
    currentTask: "Do not disturb",
    lastMessage: "Thanks for the help earlier!",
    avatar: "SJ",
    mutualFriends: 8,
  },
  {
    id: "3",
    name: "Mike Williams",
    firstName: "Mike",
    lastName: "Williams",
    status: "idle" as const,
    currentTask: "Completed task 5m ago",
    lastMessage: null,
    avatar: "MW",
    mutualFriends: 12,
  },
  {
    id: "4",
    name: "Emma Davis",
    firstName: "Emma",
    lastName: "Davis",
    status: "online" as const,
    currentTask: "Machine learning research",
    lastMessage: null,
    avatar: "ED",
    mutualFriends: 5,
  },
];


// Teams data structure
// Mock rooms for teams tab
const MOCK_TEAM_ROOMS: Room[] = [
  {
    id: "team-room-1",
    name: "Engineering",
    url: "/engineering",
    type: "private",
    members: MOCK_FRIENDS.slice(0, 3).map(f => ({ ...f, status: "online" as const, task: "Building features" })),
    activeCount: 2,
    weeklyStats: { totalTime: "127h 45m", totalTasks: 89 },
    description: "Core engineering team workspace",
    createdBy: "system",
    isOwner: false,
    isAdmin: false,
    admins: ["user-1"],
    maxMembers: 50,
  },
  {
    id: "team-room-2",
    name: "Design",
    url: "/design",
    type: "private",
    members: MOCK_FRIENDS.slice(2, 5).map(f => ({ ...f, status: "idle" as const })),
    activeCount: 1,
    weeklyStats: { totalTime: "82h 30m", totalTasks: 45 },
    description: "Creative design collaboration",
    createdBy: "system",
    isOwner: false,
    isAdmin: false,
    admins: ["user-2"],
    maxMembers: 50,
  },
  {
    id: "team-room-3",
    name: "Marketing",
    url: "/marketing",
    type: "private",
    members: MOCK_FRIENDS.slice(1, 4).map(f => ({ ...f, status: "offline" as const })),
    activeCount: 0,
    weeklyStats: { totalTime: "54h 15m", totalTasks: 67 },
    description: "Marketing strategy and campaigns",
    createdBy: "system",
    isOwner: false,
    isAdmin: false,
    admins: ["user-3"],
    maxMembers: 50,
  },
];

const TEAMS_DATA = {
  vendorsage: {
    id: "vendorsage",
    name: "Vendorsage",
    description: "Your primary team workspace",
    members: MOCK_FRIENDS.slice(0, 4), // Use existing friends data
    rooms: MOCK_TEAM_ROOMS,
    createdBy: "You",
    createdAt: "2024-01-15",
  },
  nexus: {
    id: "nexus",
    name: "Nexus",
    description: "New team workspace",
    members: [MOCK_FRIENDS[0]], // Only the creator
    rooms: [], // No rooms yet
    createdBy: MOCK_FRIENDS[0].name,
    createdAt: new Date().toISOString().split("T")[0],
  },
};

const WorkSpace: React.FC<WorkSpaceProps> = ({ onClose }) => {
  const router = useRouter();
  
  // Get rooms from Redux store
  const { rooms: reduxRooms } = useSelector((state: RootState) => state.workspace);
  const user = useSelector((state: RootState) => state.user);
  
  const [activeTab, setActiveTab] = useState<TabType>("experiment");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("create");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [newRoomType, setNewRoomType] = useState<"public" | "private">("public");
  const [newRoomTeam, setNewRoomTeam] = useState("create");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showInviteModal, setShowInviteModal] = useState<Room | null>(null);
  const [showMembersModal, setShowMembersModal] = useState<Room | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showTeamInviteModal, setShowTeamInviteModal] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState<Room | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [preferences, setPreferences] = useState({
    activityType: "any",
    roomSize: "any",
    workStyle: "any",
  });
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState<Room | null>(null);
  const [myRoomsOrder, setMyRoomsOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Store active counts for each room
  const [roomActiveCounts, setRoomActiveCounts] = useState<Record<string, number>>({});
  // Store all users for each room (both active and idle)
  const [roomUsers, setRoomUsers] = useState<Record<string, Array<{userId: string; firstName?: string; lastName?: string; picture?: string | null; isActive: boolean}>>>({});
  // Store ephemeral rooms from Firebase
  const [ephemeralRooms, setEphemeralRooms] = useState<Room[]>([]);
  const [showProfileModal, setShowProfileModal] = useState<{
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    status: string;
    currentTask?: string;
    avatar: string;
    lastMessage?: string | null;
    mutualFriends: number;
  } | null>(null);

  // Update flag when disclaimer is dismissed
  useEffect(() => {
  }, []);


  // Update myRoomsOrder when rooms change
  useEffect(() => {
    const allRooms = [...reduxRooms.map(r => ({ ...r, members: r.members || [] })), ...ephemeralRooms];
    const allRoomIds = allRooms.map((room) => room.id);
    
    setMyRoomsOrder(prevOrder => {
      // Update order if there are new rooms or rooms have been removed
      const hasNewRooms = allRoomIds.some(id => !prevOrder.includes(id));
      const hasRemovedRooms = prevOrder.some(id => !allRoomIds.includes(id));
      
      if (hasNewRooms || hasRemovedRooms) {
        // Keep existing order for rooms that still exist, append new rooms
        const existingOrder = prevOrder.filter(id => allRoomIds.includes(id));
        const newRoomIds = allRoomIds.filter(id => !prevOrder.includes(id));
        return [...existingOrder, ...newRoomIds];
      }
      
      // Return previous order if no changes needed
      return prevOrder;
    });
  }, [reduxRooms, ephemeralRooms]);

  // Update newRoomTeam when selectedTeam changes
  useEffect(() => {
    setNewRoomTeam(selectedTeam);
  }, [selectedTeam]);
  
  // Listen to Firebase Presence to get active user counts and user data for each room
  useEffect(() => {
    // Create listeners for both Presence and Users
    const presenceRef = ref(rtdb, 'Presence');
    const usersRef = ref(rtdb, 'Users');
    
    let presenceData: Record<string, { sessions?: Record<string, unknown> }> | null = null;
    let usersData: Record<string, { firstName?: string; lastName?: string; picture?: string }> | null = null;
    let postgresUsers: Record<string, { firstName: string; lastName: string; profileImage: string | null }> | null = null;
    
    const updateRoomData = async () => {
      if (!presenceData || !usersData) return;
      
      // Fetch PostgreSQL users if we haven't already or if presence data changed
      if (!postgresUsers && presenceData) {
        const authIds = Object.keys(presenceData);
        if (authIds.length > 0) {
          try {
            const response = await fetch('/api/users/by-auth-ids', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ authIds })
            });
            if (response.ok) {
              const data = await response.json();
              postgresUsers = data.users || {};
            }
          } catch (error) {
            console.error('Failed to fetch PostgreSQL users:', error);
          }
        }
      }
      
      const roomCounts: Record<string, number> = {};
      const roomUsers: Record<string, Array<{userId: string; firstName?: string; lastName?: string; picture?: string | null; isActive: boolean}>> = {};
      
      // Iterate through all users in Presence
      for (const [userId, userData] of Object.entries(presenceData)) {
        const userSessions = (userData as { sessions?: Record<string, unknown> }).sessions;
        if (!userSessions) continue;
        
        
        // Get user data - prefer PostgreSQL, fallback to Firebase Users
        const pgUser = postgresUsers?.[userId];
        const fbUser = usersData[userId];
        const userInfo = pgUser ? {
          firstName: pgUser.firstName,
          lastName: pgUser.lastName,
          picture: pgUser.profileImage
        } : fbUser;
        
        
        // Check each session for this user
        for (const [, sessionData] of Object.entries(userSessions)) {
          const session = sessionData as { roomId?: string; isActive?: boolean; userId?: string; users?: Record<string, unknown> };
          
          // Process all sessions that have a roomId (both active and idle)
          if (session.roomId) {
            // Find the room that matches this Firebase roomId
            const matchingReduxRoom = reduxRooms.find(r => r.firebaseId === session.roomId);
            const matchingEphemeralRoom = ephemeralRooms.find(r => r.firebaseId === session.roomId);
            const matchingRoom = matchingReduxRoom || matchingEphemeralRoom;
            
            if (matchingRoom) {
              // Only increment count if session is active
              if (session.isActive) {
                roomCounts[matchingRoom.id] = (roomCounts[matchingRoom.id] || 0) + 1;
              }
              
              // Initialize array if needed
              if (!roomUsers[matchingRoom.id]) {
                roomUsers[matchingRoom.id] = [];
              }
              
              // Add user to room's users list (avoid duplicates)
              const existingUser = roomUsers[matchingRoom.id].find(u => u.userId === userId);
              if (!existingUser) {
                roomUsers[matchingRoom.id].push({
                  userId,
                  firstName: userInfo?.firstName || '',
                  lastName: userInfo?.lastName || '',
                  picture: userInfo?.picture || null,
                  isActive: session.isActive || false
                });
              } else if (session.isActive && !existingUser.isActive) {
                // Update existing user to active if any of their sessions is active
                existingUser.isActive = true;
              }
            }
          }
        }
      }
      
      
      setRoomActiveCounts(roomCounts);
      setRoomUsers(roomUsers);
    };
    
    const handlePresenceUpdate = (snapshot: import("firebase/database").DataSnapshot) => {
      const newPresenceData = snapshot.exists() ? snapshot.val() : {};
      const oldUserIds = presenceData ? Object.keys(presenceData) : [];
      const newUserIds = Object.keys(newPresenceData);
      
      // Only reset PostgreSQL users if the user list actually changed
      const usersChanged = oldUserIds.length !== newUserIds.length || 
                          !oldUserIds.every(id => newUserIds.includes(id));
      
      presenceData = newPresenceData;
      
      if (usersChanged) {
        postgresUsers = null; // Only reset if users actually changed
      }
      
      updateRoomData();
    };
    
    const handleUsersUpdate = (snapshot: import("firebase/database").DataSnapshot) => {
      usersData = snapshot.exists() ? snapshot.val() : {};
      updateRoomData();
    };
    
    // Set up listeners
    onValue(presenceRef, handlePresenceUpdate);
    onValue(usersRef, handleUsersUpdate);
    
    // Cleanup
    return () => {
      off(presenceRef, 'value', handlePresenceUpdate);
      off(usersRef, 'value', handleUsersUpdate);
    };
  }, [reduxRooms, ephemeralRooms]);

  // Listen to Firebase EphemeralRooms for temporary rooms
  useEffect(() => {
    const ephemeralRoomsRef = ref(rtdb, 'EphemeralRooms');
    
    const handleRoomsUpdate = (snapshot: import("firebase/database").DataSnapshot) => {
      
      if (!snapshot.exists()) {
        setEphemeralRooms([]);
        return;
      }
      
      const ephemeralRoomsData = snapshot.val();
      
      const ephemeralRoomsList: Room[] = [];
      
      // Process each room from Firebase EphemeralRooms
      for (const [roomId, roomData] of Object.entries(ephemeralRoomsData)) {
        const room = roomData as { url?: string; name?: string; userCount?: number; createdBy?: string; createdAt?: number };
        
        // Extract room URL from the data
        const roomUrl = room.url ? `/${room.url}` : `/${roomId}`;
        
        // Ephemeral rooms by definition don't exist in PostgreSQL
        // Just add all ephemeral rooms from Firebase
        if (room.url && room.name) {
          const ephemeralRoom = {
            id: `ephemeral-${roomId}`, // Prefix to avoid ID conflicts
            name: room.name || room.url || `temp-room-${roomId.slice(-4)}`, // Use the formatted name
            url: roomUrl,
            type: 'public' as const,
            firebaseId: roomId,
            members: [],
            activeCount: room.userCount || 0,
            weeklyStats: {
              totalTime: '0m',
              totalTasks: 0
            },
            description: 'This room will close when empty',
            createdBy: room.createdBy || 'Anonymous',
            isPinned: false,
            isOwner: false,
            isAdmin: false,
            admins: [],
            maxMembers: 50,
            isEphemeral: true, // Mark as ephemeral
            createdAt: room.createdAt
          };
          ephemeralRoomsList.push(ephemeralRoom);
        }
      }
      
      setEphemeralRooms(ephemeralRoomsList);
    };
    
    // Set up listener
    onValue(ephemeralRoomsRef, handleRoomsUpdate);
    
    // Cleanup
    return () => {
      off(ephemeralRoomsRef, 'value', handleRoomsUpdate);
    };
  }, [reduxRooms]);

  // Get pathname using Next.js hook
  const pathname = usePathname();
  
  // Simple approach: Get current room from URL
  const currentRoomUrl = useMemo(() => {
    // Remove the leading slash to get the room URL
    const roomUrl = pathname ? pathname.substring(1) : ""; // e.g., "/test" becomes "test"
    return roomUrl;
  }, [pathname]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter rooms based on search and tab
  const filteredRooms = useMemo(() => {
    // Merge Redux rooms with ephemeral rooms
    const allRooms = [...reduxRooms.map(r => ({ ...r, members: r.members || [] })), ...ephemeralRooms];
    let filteredRooms = allRooms;

    // For experiment tab, show all rooms (both public and private/Vendorsage)
    if (activeTab === "experiment") {
      filteredRooms = allRooms;
    }

    if (searchQuery) {
      filteredRooms = filteredRooms.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.members || []).some((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Sort based on tab
    if (activeTab === "experiment") {
      // Sort by: 1) Current room, 2) Private, 3) Public, 4) Ephemeral
      return [...filteredRooms].sort((a, b) => {
        // Helper functions to check room properties (handle URLs with or without slash)
        const cleanUrlA = a.url.replace(/^\//, '').toLowerCase();
        const cleanUrlB = b.url.replace(/^\//, '').toLowerCase();
        const cleanCurrentUrl = currentRoomUrl.replace(/^\//, '').toLowerCase();
        
        const isCurrentA = cleanUrlA === cleanCurrentUrl;
        const isCurrentB = cleanUrlB === cleanCurrentUrl;
        
        // Debug logging removed to prevent infinite loop
        
        // Current room always first
        if (isCurrentA && !isCurrentB) return -1;
        if (!isCurrentA && isCurrentB) return 1;

        // If neither is current room, sort by type: private -> public -> ephemeral
        const isPrivateA = a.type === "private";
        const isPrivateB = b.type === "private";
        const isPublicA = a.type === "public" && !a.isEphemeral && !a.id.startsWith('ephemeral-');
        const isPublicB = b.type === "public" && !b.isEphemeral && !b.id.startsWith('ephemeral-');
        const isEphemeralA = a.isEphemeral || a.id.startsWith('ephemeral-');
        const isEphemeralB = b.isEphemeral || b.id.startsWith('ephemeral-');
        
        // Private rooms come first (after current room)
        if (isPrivateA && !isPrivateB) return -1;
        if (!isPrivateA && isPrivateB) return 1;
        
        // Then public rooms (non-ephemeral)
        if (isPublicA && isEphemeralB) return -1;
        if (isEphemeralA && isPublicB) return 1;
        
        // Within same category, sort by pinned status
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }

        // Then by custom order if available
        const indexA = myRoomsOrder.indexOf(a.id);
        const indexB = myRoomsOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        
        // Finally by name
        return a.name.localeCompare(b.name);
      });
    } else if (activeTab === "team") {
      // For team tab, only show private rooms (exclude ephemeral)
      return filteredRooms.filter((r) => r.type === "private" && !r.id.startsWith('ephemeral-'));
    } else {
      // Default sort by active count for quick-join
      return [...filteredRooms].sort((a, b) => b.activeCount - a.activeCount);
    }
  }, [activeTab, searchQuery, myRoomsOrder, reduxRooms, ephemeralRooms, currentRoomUrl]);


  // const totalActiveUsers = reduxRooms.reduce((sum, room) => sum + room.activeCount, 0); // Unused - commented out
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  const [globalActiveRooms, setGlobalActiveRooms] = useState(0);
  
  // Listen to real-time online user count and public room count
  useEffect(() => {
    // Initial fetch for online users
    const fetchOnlineUsers = async () => {
      try {
        const count = await PresenceService.getTotalOnlineUsers();
        setGlobalActiveUsers(count);
        
        // Also fix any orphaned sessions
        await PresenceService.fixOrphanedSessions();
      } catch (error) {
        console.error('Failed to fetch online users:', error);
      }
    };
    
    fetchOnlineUsers();
    
    // Listen to real-time user changes
    const unsubscribeUsers = PresenceService.listenToTotalOnlineUsers((count) => {
      setGlobalActiveUsers(count);
    });
    
    // Listen to real-time room count (public + active private)
    const publicRoomsRef = ref(rtdb, 'PublicRooms');
    const privateRoomsRef = ref(rtdb, 'PrivateRooms');
    
    let publicCount = 0;
    let privateWithUsersCount = 0;
    
    const updateTotalRooms = () => {
      setGlobalActiveRooms(publicCount + privateWithUsersCount);
    };
    
    // Listen to public rooms
    const publicRoomHandler = (snapshot: { exists: () => boolean; val: () => Record<string, unknown> }) => {
      if (snapshot.exists()) {
        const rooms = snapshot.val();
        publicCount = Object.keys(rooms).length;
      } else {
        publicCount = 0;
      }
      updateTotalRooms();
    };
    
    // Listen to private rooms
    const privateRoomHandler = (snapshot: { exists: () => boolean; val: () => Record<string, unknown> }) => {
      if (snapshot.exists()) {
        const rooms = snapshot.val();
        // Count private rooms with at least 1 user
        privateWithUsersCount = Object.values(rooms).filter((room) => 
          (room as { userCount?: number }).userCount && (room as { userCount?: number }).userCount! > 0
        ).length;
      } else {
        privateWithUsersCount = 0;
      }
      updateTotalRooms();
    };
    
    onValue(publicRoomsRef, publicRoomHandler);
    onValue(privateRoomsRef, privateRoomHandler);
    
    return () => {
      unsubscribeUsers();
      off(publicRoomsRef, 'value', publicRoomHandler);
      off(privateRoomsRef, 'value', privateRoomHandler);
    };
  }, [])

  const handleJoinRoom = (roomUrl: string) => {
    onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(roomUrl as any);
  };

  const handleQuickJoin = async () => {
    try {
      // Get current user ID
      const userId = user?.user_id || 'anonymous';
      
      // Get all public rooms (combining redux rooms and ephemeral rooms)
      const allPublicRooms = [...reduxRooms, ...ephemeralRooms].filter(room => 
        room.type === "public" || !room.type // Some rooms might not have type specified
      );
      
      
      // Separate permanent rooms (like GSD) from ephemeral rooms
      const permanentRooms = allPublicRooms.filter(room => 
        room.url === "gsd" || room.url === "/gsd" || reduxRooms.some(r => r.id === room.id)
      );
      const ephemeralRoomsFiltered = allPublicRooms.filter(room => 
        ephemeralRooms.some(e => e.id === room.id) && room.url !== "gsd" && room.url !== "/gsd"
      );
      
      
      // First, check permanent rooms (like GSD) for empty ones
      // Sort to prioritize GSD first
      const sortedPermanentRooms = permanentRooms.sort((a, b) => {
        if (a.url === "gsd" || a.url === "/gsd") return -1;
        if (b.url === "gsd" || b.url === "/gsd") return 1;
        return 0;
      });
      
      for (const room of sortedPermanentRooms) {
        const totalUsers = (roomUsers[room.id] || []).length;
        
        if (totalUsers <= 10) {
          // Found a permanent room with 10 or fewer users, join it
          const roomUrl = room.url.startsWith('/') ? room.url.substring(1) : room.url;
          handleJoinRoom(roomUrl);
          return;
        }
      }
      
      // No permanent rooms with ≤10 users found
      // For ephemeral rooms, ONLY join if they have people (to ensure they still exist)
      for (const room of ephemeralRoomsFiltered) {
        const totalUsers = (roomUsers[room.id] || []).length;
        
        // Only consider ephemeral rooms that have at least 1 user (so we know they exist)
        // AND have 10 or fewer users
        if (totalUsers > 0 && totalUsers <= 10) {
          const roomUrl = room.url.startsWith('/') ? room.url.substring(1) : room.url;
          handleJoinRoom(roomUrl);
          return;
        }
      }
      
      // No suitable rooms found, create a new ephemeral room
      await roomService.createRoomAndNavigate(userId);
      
    } catch (error) {
      console.error("Error in Quick Join:", error);
      // Fallback: try to join GSD
      handleJoinRoom("gsd");
    }
  };

  const handleCreateRoom = () => {
    setShowCreateRoom(!showCreateRoom);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      // Get the current order from filteredRooms
      const currentOrder = filteredRooms.map(r => r.id);
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over?.id as string);
      
      // Update myRoomsOrder with the new arrangement
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setMyRoomsOrder(newOrder);
    }

    setActiveId(null);
  };

  const getStatusColor = (status: "online" | "idle" | "offline", task?: string) => {
    if (status === "online" && task && task.includes("Do not disturb")) {
      return "bg-red-500";
    }
    switch (status) {
      case "online":
        return "bg-green-500";
      case "idle":
        return "bg-yellow-500";
      case "offline":
        return "bg-gray-600";
      default:
        return "bg-gray-600";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>

      <div
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[900px] h-[85vh] flex flex-col border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Workspace</h2>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-0 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
          >
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-gray-800/50 rounded-full p-1 mb-4">
          <button
            onClick={() => setActiveTab("experiment")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === "experiment" ? "bg-[#FFAA00] text-black" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 ${
              activeTab === "team" ? "bg-[#FFAA00] text-black" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Teams
          </button>
        </div>

        {/* Rooms Grid / Quick Join */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2">
          {activeTab === "experiment" ? (
            // Experiment Tab - Combined Quick Join and My Rooms
            <div className="flex flex-col h-full space-y-4">
              {/* Compact Quick Join Section */}
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <svg
                      className="w-5 h-5 text-[#FFAA00] flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-200">Quick Join</h3>
                        <p className="text-base text-gray-500">
                          <span className="text-green-500 font-bold">{globalActiveRooms}</span> rooms •{" "}
                          <span className="text-green-500 font-bold">{globalActiveUsers.toLocaleString()}</span> people
                          online
                        </p>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Instantly join a random room with active workers
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleQuickJoin}
                    className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB833] transition-all duration-200 flex items-center gap-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Quick Join
                  </button>
                </div>
              </div>

              {/* My Rooms List */}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-200 mb-3">My Rooms</h3>

                {/* Search and Create Room */}
                <div className="flex gap-2 mb-4 px-1">
                  <div className="flex-1 relative">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search rooms..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-800 text-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFAA00] focus:bg-gray-700 transition-all duration-200 border border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleCreateRoom}
                    className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-[#FFAA00] transition-all duration-200 flex items-center gap-2 whitespace-nowrap border border-gray-700 hover:border-[#FFAA00]"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Room
                  </button>
                </div>

                {/* Create Room Form */}
                {showCreateRoom && (
                  <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Enter Room Name"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value.slice(0, 20))}
                          maxLength={20}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                          {newRoomName.length}/20
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Enter Description"
                          value={newRoomDescription}
                          onChange={(e) => setNewRoomDescription(e.target.value.slice(0, 40))}
                          maxLength={40}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                          {newRoomDescription.length}/40
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="roomType"
                            checked={newRoomType === "public"}
                            onChange={() => setNewRoomType("public")}
                            className="text-[#FFAA00]"
                          />
                          <span className="text-sm text-gray-300">Public Room</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="roomType"
                            checked={newRoomType === "private"}
                            onChange={() => setNewRoomType("private")}
                            className="text-[#FFAA00]"
                          />
                          <span className="text-sm text-gray-300">Private Room</span>
                        </label>
                      </div>
                      {newRoomType === "private" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">Select Team</label>
                          <div className="relative">
                            <select
                              value={newRoomTeam}
                              onChange={(e) => setNewRoomTeam(e.target.value)}
                              className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-[#FFAA00] transition-colors appearance-none"
                            >
                              <option value="vendorsage">Vendorsage</option>
                              <option value="nexus">Nexus</option>
                            </select>
                            <svg
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
                          onClick={() => {
                            // Handle create room
                            setNewRoomName("");
                            setNewRoomDescription("");
                            setNewRoomTeam(selectedTeam);
                            setShowCreateRoom(false);
                          }}
                        >
                          Create
                        </button>
                        <button
                          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => {
                            setShowCreateRoom(false);
                            setNewRoomName("");
                            setNewRoomDescription("");
                            setNewRoomTeam(selectedTeam);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  measuring={{
                    droppable: {
                      strategy: MeasuringStrategy.Always,
                    },
                  }}
                >
                  <SortableContext items={filteredRooms.map(r => r.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredRooms.map((room) => {
                        if (!room) return null;

                        return (
                          <SortableRoomCard
                            key={room.id}
                            room={room}
                            currentRoomUrl={currentRoomUrl}
                            onJoinRoom={handleJoinRoom}
                            onSettingsClick={setEditingRoom}
                            activeCount={roomActiveCounts[room.id] || 0}
                            roomUsers={roomUsers[room.id] || []}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                  <DragOverlay>
                    {activeId
                      ? (() => {
                          const activeRoom = filteredRooms.find((r) => r.id === activeId);
                          if (!activeRoom) return null;

                          return (
                            <div className="bg-gray-800/95 rounded-xl border border-[#FFAA00] shadow-2xl p-4 cursor-grabbing">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-gray-200">{activeRoom.name}</h3>
                              </div>
                              <p className="text-xs text-gray-500">{activeRoom.description}</p>
                            </div>
                          );
                        })()
                      : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          ) : activeTab === "team" ? (
            // Team Tab
            <div className="flex flex-col h-full">
              {(() => {
                // Get current team data
                const currentTeam = TEAMS_DATA[selectedTeam as keyof typeof TEAMS_DATA] || TEAMS_DATA.vendorsage;
                const teamRooms = currentTeam.rooms;
                
                const allTeamMembers = new Map();
                let totalActiveMembers = 0;
                let totalTasks = 0;
                let totalTime = 0;

                // Aggregate data from all team rooms
                teamRooms.forEach((room) => {
                  (room.members || []).forEach((member) => {
                    if (!allTeamMembers.has(member.id)) {
                      allTeamMembers.set(member.id, {
                        ...member,
                        rooms: [room.name],
                      });
                    } else {
                      allTeamMembers.get(member.id).rooms.push(room.name);
                    }
                  });
                  totalActiveMembers += room.activeCount;
                  totalTasks += room.weeklyStats.totalTasks;
                  // Parse time (assumes format like "127h 45m")
                  const timeMatch = room.weeklyStats.totalTime.match(/(\d+)h\s*(\d+)m/);
                  if (timeMatch) {
                    totalTime += parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
                  }
                });

                // For Nexus team, use the team members instead of room members
                const teamMembers =
                  selectedTeam === "nexus"
                    ? currentTeam.members.map((member) => ({
                        ...member,
                        rooms: [], // Nexus team members aren't in any rooms yet
                      }))
                    : Array.from(allTeamMembers.values());

                const formatTotalTime = (minutes: number) => {
                  const hours = Math.floor(minutes / 60);
                  const mins = minutes % 60;
                  return `${hours}h ${mins}m`;
                };

                // Sort members by status priority
                const sortedMembers = teamMembers.sort((a, b) => {
                  // Priority order:
                  // 1. Actively working (online without "Do not disturb")
                  // 2. Completed task (idle status)
                  // 3. Do not disturb (online with "Do not disturb")
                  // 4. Last seen (offline)

                  const getStatusPriority = (member: { status: string; currentTask?: string; task?: string }) => {
                    const task = member.currentTask || member.task;
                    if (member.status === "online" && task && !task.includes("Do not disturb")) return 1;
                    if (member.status === "idle") return 2;
                    if (member.status === "online" && task && task.includes("Do not disturb")) return 3;
                    if (member.status === "offline") return 4;
                    return 5;
                  };

                  return getStatusPriority(a) - getStatusPriority(b);
                });

                return (
                  <div className={selectedTeam === "create" ? "flex flex-col justify-center h-full" : "space-y-6"}>
                    {selectedTeam === "create" ? (
                      // Create Team Form
                      <div className="bg-gray-800/50 rounded-lg px-6 py-4 border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-xl font-bold text-[#FFAA00]">Create New Team</h3>
                          <button
                            onClick={() => {
                              setSelectedTeam("vendorsage");
                              setNewTeamName("");
                              setInviteEmails("");
                            }}
                            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                          >
                            <svg
                              className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>

                        {/* Value Proposition */}
                        <div className="mb-4 space-y-3">
                          <div className="text-center space-y-2">
                            <h2 className="text-xl font-bold text-gray-200">Transform Your Team&apos;s Productivity</h2>
                            <p className="text-sm text-gray-400 max-w-2xl mx-auto">
                              Create dedicated workspaces where your team can focus and achieve more together.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-[#FFAA00]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <svg
                                    className="w-5 h-5 text-[#FFAA00]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 10V3L4 14h7v7l9-11h-7z"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-200 mb-1">Boost Morale</h4>
                                  <p className="text-sm text-gray-400">
                                    Work is easier when people don&apos;t feel alone
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-[#FFAA00]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <svg
                                    className="w-5 h-5 text-[#FFAA00]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-200 mb-1">Visibility</h4>
                                  <p className="text-sm text-gray-400">
                                    See real-time activity and progress as it happens
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-[#FFAA00]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <svg
                                    className="w-5 h-5 text-[#FFAA00]"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <h4 className="font-semibold text-gray-200 mb-1">Private Rooms</h4>
                                  <p className="text-sm text-gray-400">Create rooms that only your team can access</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pricing and What Happens Next - Side by Side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                          {/* Pricing Information */}
                          <div className="bg-gradient-to-r from-[#FFAA00]/10 to-[#FFB833]/10 rounded-lg p-4 border border-[#FFAA00]/30">
                            <div className="flex items-start gap-3">
                              <svg
                                className="w-5 h-5 text-[#FFAA00] flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <div className="flex-1">
                                <h4 className="text-sm font-semibold text-[#FFAA00] mb-1">Team Pricing</h4>
                                <p className="text-sm text-gray-300 mb-3">
                                  <span className="font-semibold text-green-400">7 day free trial</span> then{" "}
                                  <span className="font-semibold text-white">$5/month per user</span>
                                </p>
                                <div className="space-y-2 text-xs text-gray-400">
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>Auto-adjusts as members join/leave</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>All members get premium access</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>Cancel anytime, no hidden fees</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* What happens next */}
                          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                            <div className="flex items-start gap-3">
                              <svg
                                className="w-5 h-5 text-green-500 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <div className="flex-1">
                                <h4 className="text-sm font-semibold text-white mb-1">What happens next?</h4>
                                <p className="text-sm text-gray-300 mb-3">
                                  <span className="font-semibold">Instant setup</span> to hit the ground running
                                </p>
                                <div className="space-y-2 text-xs text-gray-400">
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>Team created immediately</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>You&apos;ll be the team owner</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <svg
                                      className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    <span>Start inviting members</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400 mb-2">Team Name</label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Enter team name"
                                value={newTeamName}
                                onChange={(e) => setNewTeamName(e.target.value.slice(0, 30))}
                                maxLength={30}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                {newTeamName.length}/30
                              </span>
                            </div>
                          </div>
                          <button
                            disabled={!newTeamName.trim()}
                            onClick={() => {
                              // Handle create team
                              setSelectedTeam("vendorsage"); // Or switch to the new team
                              setNewTeamName("");
                              setInviteEmails("");
                            }}
                            className="px-6 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Create Team
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTeam("vendorsage");
                              setNewTeamName("");
                              setInviteEmails("");
                            }}
                            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Team Overview Header */}
                        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="relative inline-flex items-center">
                                  <select
                                    value={selectedTeam}
                                    onChange={(e) => {
                                      setSelectedTeam(e.target.value);
                                    }}
                                    className="appearance-none bg-gray-800 text-gray-200 text-lg font-semibold px-4 py-2 pr-10 rounded-lg border border-gray-700 hover:border-gray-600 focus:outline-none focus:border-[#FFAA00] transition-all cursor-pointer"
                                  >
                                    <option value="vendorsage">Vendorsage</option>
                                    <option value="nexus">Nexus</option>
                                    <option value="create">+ Create Team</option>
                                  </select>
                                  <svg
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 9l-7 7-7-7"
                                    />
                                  </svg>
                                </div>
                              </div>
                              <p className="text-gray-400">
                                {selectedTeam === "nexus"
                                  ? "Your new team workspace - invite members to get started"
                                  : currentTeam.description}
                              </p>
                            </div>
                            <button
                              onClick={() => setShowTeamInviteModal(true)}
                              className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                />
                              </svg>
                              Invite Team Member
                            </button>
                          </div>

                          {/* Team Stats */}
                          <div className="grid grid-cols-4 gap-4 mt-6">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-green-400">
                                {selectedTeam === "nexus" ? 0 : totalActiveMembers}
                              </p>
                              <p className="text-sm text-gray-500">Active Now</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-green-400">{teamMembers.length}</p>
                              <p className="text-sm text-gray-500">Total Team Members</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-green-400">
                                {selectedTeam === "nexus" ? "0h 0m" : formatTotalTime(totalTime)}
                              </p>
                              <p className="text-sm text-gray-500">Total Time This Week</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-green-400">
                                {selectedTeam === "nexus" ? 0 : totalTasks}
                              </p>
                              <p className="text-sm text-gray-500">Tasks Completed</p>
                            </div>
                          </div>
                        </div>

                        {/* Team Workspaces */}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-200 mb-4">Team Rooms ({teamRooms.length})</h3>
                          {teamRooms.length === 0 ? (
                            <div className="bg-gray-800/30 rounded-lg p-8 border border-gray-700 border-dashed text-center mb-6">
                              <svg
                                className="w-12 h-12 text-gray-600 mx-auto mb-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                />
                              </svg>
                              <p className="text-gray-500 mb-4">No rooms created yet</p>
                              <button
                                onClick={() => {
                                  setActiveTab("experiment");
                                  setShowCreateRoom(true);
                                  setNewRoomType("private");
                                  setNewRoomTeam(selectedTeam);
                                }}
                                className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200"
                              >
                                Create Your First Room
                              </button>
                            </div>
                          ) : (
                            <div className="grid gap-3 mb-6">
                              {teamRooms.map((room) => (
                                <div
                                  key={room.id}
                                  className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                        <svg
                                          className="w-5 h-5 text-purple-400"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                          />
                                        </svg>
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-200 flex items-center gap-2">
                                          {room.name}
                                          {room.id.startsWith('ephemeral-') && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                                              Temp
                                            </span>
                                          )}
                                        </h4>
                                        <p className="text-sm text-gray-500">
                                          {room.activeCount} active • {room.members?.length || 0} members
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleJoinRoom(room.url)}
                                      className="px-4 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200"
                                    >
                                      Join Room
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Team Members */}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-200 mb-4">Team Members</h3>
                          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                            {sortedMembers.map((member) => (
                              <div
                                key={member.id}
                                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => {
                                        const friend = MOCK_FRIENDS.find((f) => f.name === member.name) || {
                                          id: member.id,
                                          name: member.name,
                                          firstName: member.name.split(" ")[0],
                                          lastName: member.name.split(" ")[1] || "",
                                          status: member.status,
                                          currentTask: member.task,
                                          avatar: member.avatar,
                                          lastMessage: null,
                                          mutualFriends: Math.floor(Math.random() * 20) + 1,
                                        };
                                        setShowProfileModal(friend);
                                      }}
                                      className="relative hover:opacity-80 transition-opacity"
                                    >
                                      <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300 hover:ring-2 hover:ring-[#FFAA00] transition-all">
                                        {member.avatar}
                                      </div>
                                      <div
                                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(
                                          member.status,
                                          member.task
                                        )}`}
                                      />
                                    </button>
                                    <div className="flex-1">
                                      <button
                                        onClick={() => {
                                          const friend = MOCK_FRIENDS.find((f) => f.name === member.name) || {
                                            id: member.id,
                                            name: member.name,
                                            firstName: member.name.split(" ")[0],
                                            lastName: member.name.split(" ")[1] || "",
                                            status: member.status,
                                            currentTask: member.task,
                                            avatar: member.avatar,
                                            lastMessage: null,
                                            mutualFriends: Math.floor(Math.random() * 20) + 1,
                                          };
                                          setShowProfileModal(friend);
                                        }}
                                        className="text-left"
                                      >
                                        <h4 className="font-medium text-gray-200 hover:text-[#FFAA00] transition-colors">
                                          {member.name}
                                        </h4>
                                      </button>
                                      <div className="flex items-center gap-2 text-sm">
                                        <p className="text-gray-500">
                                          {(() => {
                                            if (member.status === "online" && member.task) {
                                              if (member.task.includes("Do not disturb")) {
                                                return "Do not disturb";
                                              }
                                              return "Actively working";
                                            } else if (member.status === "idle") {
                                              return "Standby";
                                            } else {
                                              // Offline - show last seen with fixed times based on member ID
                                              const lastSeenMap: Record<string, string> = {
                                                "9": "5m ago",
                                                "13": "30m ago",
                                                "17": "1h ago",
                                                "21": "2h ago",
                                                "24": "5h ago",
                                                "27": "1d ago",
                                                "29": "3h ago",
                                                "30": "45m ago",
                                              };
                                              return `Last seen ${lastSeenMap[member.id] || "2h ago"}`;
                                            }
                                          })()}
                                        </p>
                                        {member.rooms && member.rooms.length > 0 && (
                                          <>
                                            <span className="text-gray-600">•</span>
                                            <p className="text-gray-500 text-xs">{member.rooms.join(", ")}</p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button className="opacity-0 group-hover:opacity-100 px-3 py-1 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all">
                                    Message
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className={`p-4 bg-gray-800/50 rounded-lg border transition-all duration-200 group flex flex-col min-h-[200px] ${
                    currentRoomUrl === room.url
                      ? "border-[#FFAA00] bg-gray-800/70"
                      : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  {/* Room Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-200">{room.name}</h3>
                        {room.id.startsWith('ephemeral-') ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                            Temp
                          </span>
                        ) : (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              room.isEphemeral
                                ? "bg-green-500/20 text-green-400"
                                : room.type === "private"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {room.isEphemeral ? "Temporary" : room.type === "private" ? "Private" : "Public"}
                          </span>
                        )}
                      </div>
                      {/* Elegant URL display */}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="font-mono text-xs">locked-in{room.url.startsWith('/') ? room.url : `/${room.url}`}</span>
          </div>
                    </div>

                    <div className="flex items-start gap-2">
                      {/* Settings Menu - Available for all users */}
                      <div className="relative group/menu">
                        <button
                          className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRoom(room);
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Quick Stats */}
                      <div className="text-right text-xs text-gray-500">
                        <div className="font-medium text-gray-400">{room.weeklyStats?.totalTime || 'Null'}</div>
                        <div>{room.weeklyStats?.totalTasks || 0} tasks</div>
                        <div className="text-[10px] mt-1">last 30 days</div>
                      </div>
                    </div>
                  </div>

                  {/* Content Section - Flex grow to push button down */}
                  <div className="flex-1">
                    {/* Active Members */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex -space-x-2">
                        {(() => {
                          const displayItems = [];
                          const users = roomUsers[room.id] || [];
                          const maxVisible = 5;
                          const hasOverflow = users.length > maxVisible;
                          const membersToShow = hasOverflow ? 4 : users.length;

                          // Sort users by status: active first, then idle
                          const sortedUsers = [...users].sort((a, b) => {
                            if (a.isActive && !b.isActive) return -1;
                            if (!a.isActive && b.isActive) return 1;
                            return 0;
                          });

                          // Add member avatars
                          for (let i = 0; i < membersToShow; i++) {
                            const user = sortedUsers[i];
                            const firstName = user.firstName || '';
                            const lastName = user.lastName || '';
                            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
                const displayInitials = initials.trim() || 'U';
                            const fullName = `${firstName} ${lastName}`.trim() || 'Unknown User';
                            
                            displayItems.push(
                              <div
                                key={user.userId}
                                className="relative"
                                title={`${fullName}${user.isActive ? ' - Active' : ' - Idle'}`}
                              >
                                {user.picture && user.picture.trim() !== '' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={user.picture}
                                    alt={fullName}
                                    className="w-8 h-8 rounded-full border-2 border-gray-900 object-cover"
                                    onError={(e) => {
                                      // If image fails to load, hide it and show initials instead
                                      const imgElement = e.currentTarget;
                                      const parent = imgElement.parentElement;
                                      if (parent) {
                                        // Replace img with initials div
                                        parent.innerHTML = `<div class="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200">${displayInitials}</div>`;
                                      }
                                    }}
                                  />
                                ) : (
                                  <div
                                    className="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200"
                                  >
                                    {displayInitials}
                                  </div>
                                )}
                                <div
                                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                                    user.isActive ? 'bg-green-500' : 'bg-yellow-500'
                                  }`}
                                />
                              </div>
                            );
                          }

                          // Add overflow indicator as just another item in the sequence
                          if (hasOverflow) {
                            const overflowCount = users.length - 4;
                            displayItems.push(
                              <div key="overflow" className="relative">
                                <div className="w-8 h-8 rounded-full border-2 border-gray-900 bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-400">
                                  {overflowCount > 99 ? "99+" : `+${overflowCount}`}
                                </div>
                              </div>
                            );
                          }

                          return displayItems;
                        })()}
                      </div>
                      <span className="text-sm text-gray-400">
                        {(roomActiveCounts[room.id] || 0) > 0 ? (
                          <span className="text-green-400">{roomActiveCounts[room.id]} actively working</span>
                        ) : (roomUsers[room.id] || []).length > 0 ? (
                          <span className="text-gray-500">No one actively working</span>
                        ) : (
                          <span className="text-gray-500">This room is empty</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Join Button - Always at bottom */}
                  <button
                    onClick={() => handleJoinRoom(room.url)}
                    className={`w-full py-2 rounded-lg font-medium transition-all duration-200 ${
                      currentRoomUrl === room.url
                        ? "bg-gray-700 text-gray-400 cursor-default"
                        : "bg-gray-700 text-gray-300 hover:bg-[#FFAA00] hover:text-black"
                    }`}
                    disabled={currentRoomUrl === room.url}
                  >
                    {currentRoomUrl === room.url ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-sync-pulse" />
                        Current Room
                      </span>
                    ) : (
                      "Join Room"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Room Settings Modal */}
      {editingRoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setEditingRoom(null);
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[600px] max-h-[90vh] overflow-y-auto border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#FFAA00]">Room Settings</h3>
              <button
                onClick={() => setEditingRoom(null)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
              >
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Only show room management options for owners/admins */}
              {(editingRoom.isOwner || editingRoom.isAdmin) && (
                <>
                  {/* Room Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Room Name</label>
                      <input
                        type="text"
                        defaultValue={editingRoom.name}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-[#FFAA00]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Room URL</label>
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        <span className="text-gray-300 font-mono text-sm">locked-in{editingRoom.url.startsWith('/') ? editingRoom.url : `/${editingRoom.url}`}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Danger Zone */}
              <div className="border-t border-gray-700 pt-6">
                <h4 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h4>
                <div className="space-y-2">
                  {!editingRoom.isOwner && (
                    <button
                      onClick={() => {
                        setShowLeaveConfirmModal(editingRoom);
                        setEditingRoom(null);
                      }}
                      className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors w-full flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      Leave Room
                    </button>
                  )}
                  {editingRoom.isOwner && (
                    <button
                      onClick={() => {
                        setShowDeleteModal(editingRoom);
                        setEditingRoom(null);
                        setDeleteConfirmName("");
                      }}
                      className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors w-full"
                    >
                      Delete Room
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {editingRoom.isOwner || editingRoom.isAdmin ? (
                <div className="flex gap-3 pt-4">
                  <button
                    className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
                    onClick={() => setEditingRoom(null)}
                  >
                    Save Changes
                  </button>
                  <button
                    className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                    onClick={() => setEditingRoom(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 pt-4">
                  <button
                    className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                    onClick={() => setEditingRoom(null)}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members Management Modal */}
      {showMembersModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowMembersModal(null);
            setMemberSearchQuery("");
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[700px] max-h-[90vh] overflow-y-auto border border-gray-800 custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-[#FFAA00]">Manage Members</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {showMembersModal.members.length} members • {showMembersModal.maxMembers || 50} max
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingRoom(showMembersModal);
                    setShowMembersModal(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                  title="Back to Room Settings"
                >
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setShowMembersModal(null);
                    setMemberSearchQuery("");
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00]"
              />
            </div>

            {/* Members List */}
            <div className="space-y-2 mb-6">
              {showMembersModal.members
                .filter((member) => member.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                .map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300">
                          {member.avatar}
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${(() => {
                            if (member.status === "offline") return "bg-gray-600";
                            if (member.status === "idle") return "bg-yellow-500";
                            if (member.status === "online" && member.task) {
                              if (member.task.toLowerCase().includes("do not disturb")) return "bg-red-500";
                              if (member.task.toLowerCase().includes("completed")) return "bg-yellow-500";
                            }
                            return "bg-green-500";
                          })()}`}
                        />
                      </div>
                      <div>
                        <p className="font-medium text-gray-200">{member.name}</p>
                        <p className="text-xs text-gray-500">
                          {showMembersModal.admins?.includes(member.name) && (
                            <span className="text-[#FFAA00]">Admin • </span>
                          )}
                          {(() => {
                            if (member.status === "online" && member.task) {
                              // Check for different task states
                              if (member.task.toLowerCase().includes("do not disturb")) {
                                return "Do not disturb";
                              } else if (member.task.toLowerCase().includes("completed")) {
                                // Extract time from task like "Completed task 15m ago"
                                const timeMatch = member.task.match(/(\d+[hm])/);
                                return `Completed task ${timeMatch ? timeMatch[1] : "5m"} ago`;
                              } else {
                                return "Actively working";
                              }
                            } else if (member.status === "online") {
                              return "Actively working";
                            } else if (member.status === "idle") {
                              // Idle status represents completed task
                              return `Completed task ${member.duration || "5m ago"}`;
                            } else {
                              return `Last seen ${member.duration || "2h ago"}`;
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {showMembersModal.admins?.includes(member.name) ? (
                        <button className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors">
                          Remove Admin
                        </button>
                      ) : (
                        <button className="px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors">
                          Make Admin
                        </button>
                      )}
                      <button className="px-3 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Admins Section */}
            <div className="border-t border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3">
                Room Admins ({showMembersModal.admins?.length || 0})
              </h4>
              <div className="flex flex-wrap gap-2">
                {showMembersModal.admins?.map((admin) => (
                  <span key={admin} className="px-3 py-1 bg-[#FFAA00]/20 text-[#FFAA00] rounded-full text-sm">
                    {admin}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowInviteModal(null);
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[500px] border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#FFAA00]">Invite to {showInviteModal.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingRoom(showInviteModal);
                    setShowInviteModal(null);
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                  title="Back to Room Settings"
                >
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setShowInviteModal(null)}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Invite by username or email</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter username or email..."
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00]"
                  />
                  <button className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors">
                    Send
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-900 text-gray-500">or</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Share room link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}${showInviteModal.url}`}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm"
                  />
                  <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteModal(null);
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[450px] border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-red-400">Delete Room</h3>
              <button
                onClick={() => {
                  setShowDeleteModal(null);
                  setDeleteConfirmName("");
                }}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
              >
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm text-red-300 mb-2">
                  <strong>Warning:</strong> This action cannot be undone. This will permanently delete the room and
                  remove all members.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Type <span className="text-red-400 font-bold">{showDeleteModal.name}</span> to confirm deletion
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Type room name here..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Handle actual deletion
                    setShowDeleteModal(null);
                    setDeleteConfirmName("");
                    // Navigate to home or show success message
                    router.push("/");
                  }}
                  disabled={deleteConfirmName !== showDeleteModal.name}
                  className={`flex-1 px-4 py-2 font-medium rounded-lg transition-colors ${
                    deleteConfirmName === showDeleteModal.name
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Delete Room
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(null);
                    setDeleteConfirmName("");
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Room Confirmation Modal */}
      {showLeaveConfirmModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowLeaveConfirmModal(null);
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[450px] border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-200">Leave Room?</h3>
              <button
                onClick={() => setShowLeaveConfirmModal(null)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
              >
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-gray-400">
                Are you sure you want to leave{" "}
                <span className="text-white font-medium">{showLeaveConfirmModal.name}</span>?
              </p>

              {showLeaveConfirmModal.type === "private" && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-300">
                    This is a private room. You&apos;ll need an invitation to rejoin.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Handle leaving the room
                    setShowLeaveConfirmModal(null);
                    // TODO: Implement actual leave logic
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Leave Room
                </button>
                <button
                  onClick={() => setShowLeaveConfirmModal(null)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preferences Modal */}
      {showPreferencesModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowPreferencesModal(false);
          }}
        >
          <div
            className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[95%] max-w-[500px] border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#FFAA00]">Join by Preference</h3>
              <button
                onClick={() => setShowPreferencesModal(false)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
              >
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Activity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Activity Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "any", label: "Any Activity" },
                    { value: "coding", label: "Coding" },
                    { value: "studying", label: "Studying" },
                    { value: "writing", label: "Writing" },
                    { value: "design", label: "Design" },
                    { value: "research", label: "Research" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPreferences({ ...preferences, activityType: option.value })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        preferences.activityType === option.value
                          ? "bg-[#FFAA00] text-black"
                          : "bg-gray-800 text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Room Size */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Room Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "any", label: "Any Size" },
                    { value: "small", label: "Small (2-5)" },
                    { value: "medium", label: "Medium (6-10)" },
                    { value: "large", label: "Large (11-20)" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPreferences({ ...preferences, roomSize: option.value })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        preferences.roomSize === option.value
                          ? "bg-[#FFAA00] text-black"
                          : "bg-gray-800 text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work Style */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">Work Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "any", label: "Any Style" },
                    { value: "quiet", label: "Quiet Focus" },
                    { value: "collaborative", label: "Collaborative" },
                    { value: "pomodoro", label: "Pomodoro" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPreferences({ ...preferences, workStyle: option.value })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        preferences.workStyle === option.value
                          ? "bg-[#FFAA00] text-black"
                          : "bg-gray-800 text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowPreferencesModal(false)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowPreferencesModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal &&
        (() => {
          const profileUser = showProfileModal;

          return (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileModal(null);
              }}
            >
              <div
                className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-6 w-[90%] max-w-[400px] border border-gray-800"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header with Close Button */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-[#FFAA00]">Profile</h3>
                  <button
                    onClick={() => setShowProfileModal(null)}
                    className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Profile Content */}
                <div className="flex flex-col items-center">
                  {/* Avatar */}
                  <div className="relative mb-4">
                    <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-2xl font-bold text-gray-300">
                      {profileUser.avatar}
                    </div>
                    <div
                      className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-gray-900 ${
                        profileUser.status === "online"
                          ? "bg-green-500"
                          : profileUser.status === "idle"
                          ? "bg-yellow-500"
                          : "bg-gray-600"
                      }`}
                    />
                  </div>

                  {/* Name and Status */}
                  <h4 className="text-xl font-semibold text-gray-200 mb-1">{profileUser.name}</h4>
                  <p className="text-sm text-gray-500 mb-4">
                    {(() => {
                      if (profileUser.status === "online" && profileUser.currentTask) {
                        if (profileUser.currentTask.includes("Do not disturb")) {
                          return "Do not disturb";
                        }
                        return "Actively working";
                      } else if (profileUser.status === "idle") {
                        return "Standby";
                      } else {
                        return "Last seen 2h ago";
                      }
                    })()}
                  </p>

                  {/* Mutual Friends */}
                  {profileUser.mutualFriends && (
                    <p className="text-sm text-gray-500 mb-4">{profileUser.mutualFriends} mutual contacts</p>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => setShowProfileModal(null)}
                    className="w-full px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
                  >
                    Message
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Team Invite Modal */}
      {showTeamInviteModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={(e) => {
            e.stopPropagation();
            setShowTeamInviteModal(false);
            setInviteEmails("");
          }}
        >
          <div
            className="bg-gray-900 rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-[#FFAA00]">Invite Team Members</h3>
                <button
                  onClick={() => {
                    setShowTeamInviteModal(false);
                    setInviteEmails("");
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 group-hover:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Email Input Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Invite by email</label>
                  <textarea
                    placeholder="Enter email addresses (comma separated)"
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">You can invite multiple people at once</p>
                </div>

                {/* Personal Message (Optional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Personal message <span className="text-gray-600">(optional)</span>
                  </label>
                  <textarea
                    placeholder="Add a personal note to your invitation..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors resize-none"
                    rows={3}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      // Handle send invitations
                      setShowTeamInviteModal(false);
                      setInviteEmails("");
                    }}
                    className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center justify-center gap-2"
                    disabled={!inviteEmails.trim()}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    Send Invitations
                  </button>
                  <button
                    onClick={() => {
                      setShowTeamInviteModal(false);
                      setInviteEmails("");
                    }}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Modal - Now integrated into Teams tab */}
      {/* {showCreateTeamModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={(e) => {
          e.stopPropagation();
          setShowCreateTeamModal(false);
          setNewTeamName("");
          setInviteEmails("");
        }}>
          <div
            className="bg-gray-900 rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto custom-scrollbar border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-[#FFAA00]">Create New Team</h3>
                <button
                  onClick={() => {
                    setShowCreateTeamModal(false);
                    setNewTeamName("");
                    setNewTeamDescription("");
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg
                    className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Team Name</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter team name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value.slice(0, 30))}
                      maxLength={30}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                      {newTeamName.length}/30
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Invite Team Members
                  </label>
                  <textarea
                    placeholder="Enter email addresses (you can do this later)"
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors resize-none"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-400 mb-2">What happens next?</h4>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Your team will be created immediately</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>You'll be the team owner and first member</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Invite members and create rooms to get started</span>
                  </li>
                </ul>
              </div>
              
              <div className="flex gap-3">
                <button
                  disabled={!newTeamName.trim()}
                  onClick={() => {
                    // Handle create team
                    console.log("Creating team:", newTeamName, "with invites:", inviteEmails);
                    setShowCreateTeamModal(false);
                    setNewTeamName("");
                    setInviteEmails("");
                    // In a real app, you would add the new team to the teams list
                    // and switch to it
                  }}
                  className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Team
                </button>
                <button
                  onClick={() => {
                    setShowCreateTeamModal(false);
                    setNewTeamName("");
                    setNewTeamDescription("");
                  }}
                  className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
};

export default WorkSpace;
