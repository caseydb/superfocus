"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { fetchWorkspace } from "../../store/workspaceSlice";
import { PresenceService } from "@/app/utils/presenceService";
import { rtdb } from "@/lib/firebase";
import { ref, onValue, off } from "firebase/database";
import { roomService } from "@/app/services/roomService";
import { createPrivateRoom } from "@/app/utils/privateRooms";
import { createTeamRoom } from "@/app/utils/teamRooms";
import { useInstance } from "../Instances";
import SignIn from "../SignIn";
import { signInWithGoogle } from "@/lib/auth";
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
  authId?: string;
  profileImage?: string | null;
  firstName?: string;
  lastName?: string;
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
  roomUsers?: Array<{
    userId: string;
    firstName?: string;
    lastName?: string;
    picture?: string | null;
    isActive: boolean;
  }>;
  currentUser: any; // Redux user state
  firebaseUserId?: string; // Firebase UID
}

const SortableRoomCard: React.FC<SortableRoomCardProps> = ({
  room,
  currentRoomUrl,
  onJoinRoom,
  activeCount,
  roomUsers,
  currentUser,
  firebaseUserId,
}) => {
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
  const isCurrentRoom =
    currentRoomUrl === room.url || currentRoomUrl === room.url.replace(/^\//, "") || `/${currentRoomUrl}` === room.url;

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
                room.isEphemeral || room.id.startsWith("ephemeral-")
                  ? "bg-green-500/20 text-green-400"
                  : room.type === "private"
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {room.isEphemeral || room.id.startsWith("ephemeral-")
                ? "Temporary"
                : room.type === "private"
                ? "Private"
                : "Public"}
            </span>
          </div>
          {/* Elegant URL display */}
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <span className="font-mono text-xs">locked-in{room.url.startsWith("/") ? room.url : `/${room.url}`}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          {/* Settings Menu - Available for all users - COMMENTED OUT */}
          {/* <div className="relative group/menu">
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
          </div> */}

          {/* Quick Stats */}
          <div className="text-right text-xs text-gray-500">
            <div className="font-medium text-gray-400">{room.weeklyStats?.totalTime || "Null"}</div>
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
                const roomUser = sortedUsers[i];
                const firstName = roomUser.firstName || "";
                const lastName = roomUser.lastName || "";
                const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
                const displayInitials = initials.trim() || "U";
                const fullName = `${firstName} ${lastName}`.trim() || "Unknown User";
                
                // Check if this is the current user and use their animal avatar if available
                // For guest users, the roomUser.userId will be the Firebase UID
                const isCurrentUser = roomUser.userId === firebaseUserId || roomUser.userId === currentUser.user_id;
                let avatarSrc = isCurrentUser && currentUser.profile_image 
                  ? currentUser.profile_image 
                  : roomUser.picture;
                
                // If no picture and user appears to be a guest (no real name), use animal avatar
                if (!avatarSrc && (firstName === 'Guest' || firstName === '' || displayInitials === 'U' || displayInitials === 'GU')) {
                  // Generate consistent animal based on userId
                  const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
                  const animalIndex = roomUser.userId ? 
                    roomUser.userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % animals.length :
                    Math.floor(Math.random() * animals.length);
                  avatarSrc = `/${animals[animalIndex]}.png`;
                }

                displayItems.push(
                  <div
                    key={roomUser.userId}
                    className="relative"
                    title={`${fullName}${roomUser.isActive ? " - Active" : " - Idle"}`}
                  >
                    {avatarSrc && avatarSrc.trim() !== "" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
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
                      <div className="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200">
                        {displayInitials}
                      </div>
                    )}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                        roomUser.isActive ? "bg-green-500 animate-sync-pulse" : "bg-yellow-500"
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
            : "bg-gray-700 text-gray-300 hover:bg-[#FFAA00] hover:text-black cursor-pointer"
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
/*
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
*/

// Teams data structure
// Mock rooms for teams tab
/*
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
*/

// Derive teams from actual rooms data - only private rooms the user is part of (or all for superadmin)
const deriveTeamsFromRooms = (rooms: Room[], userId: string) => {
  const teams: Record<
    string,
    {
      id: string;
      name: string;
      description: string;
      members: RoomMember[];
      rooms: Room[];
      createdBy: string;
      createdAt: string;
    }
  > = {};

  // Check if user is superadmin
  const SUPERADMIN_USER_ID = "df3aed2a-ad51-457f-b0cd-f7d4225143d4";
  const isSuperadmin = userId === SUPERADMIN_USER_ID;

  // Filter to only private rooms where user is a member (or all private rooms for superadmin)
  const privateRooms = rooms.filter((room) => {
    // Check if room is private
    if (room.type !== "private") return false;

    // Superadmin sees all private rooms
    if (isSuperadmin) return true;

    // Check if user is owner
    if (room.createdBy === userId || room.isOwner) return true;

    // Check if user is admin
    if (room.isAdmin || (room.admins && room.admins.includes(userId))) return true;

    // Check if user is a member
    const isMember = room.members?.some((member) => member.id === userId);
    return isMember;
  });

  // Create teams from actual private rooms - each room is its own team
  privateRooms.forEach((room) => {
    // Use the room's slug or ID as the team ID
    const teamId = room.url || room.id;
    
    // Members list is already filtered by API to exclude superadmin from private rooms
    const memberCount = room.members?.length || 0;
    
    // For superadmin, always show "(viewing as admin)" for private rooms
    // since they're hidden from the member count
    const description = isSuperadmin && room.type === 'private'
      ? `${memberCount} members (viewing as admin)`
      : `${memberCount} members`;
    
    teams[teamId] = {
      id: teamId,
      name: room.name || room.url || "Unnamed Team",
      description,
      members: room.members || [],
      rooms: [room],
      createdBy: room.createdBy || "Unknown",
      createdAt: new Date().toISOString(),
    };
  });

  // Don't create any default teams - if no teams exist, return empty object

  return teams;
};

const WorkSpace: React.FC<WorkSpaceProps> = ({ onClose }) => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Get rooms from Redux store
  const { rooms: reduxRooms } = useSelector((state: RootState) => state.workspace);
  const user = useSelector((state: RootState) => state.user);
  const { user: firebaseUser } = useInstance();

  // Force refresh workspace data when component mounts to ensure we have latest data
  React.useEffect(() => {
    dispatch(fetchWorkspace());
  }, [dispatch]);

  const [activeTab, setActiveTab] = useState<TabType>("experiment");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  // Derive teams from actual rooms
  const derivedTeams = React.useMemo(() => {
    const allRooms = [...reduxRooms.map((r) => ({ ...r, members: r.members || [] }))];
    return deriveTeamsFromRooms(allRooms, user.user_id || "");
  }, [reduxRooms, user.user_id]);
  const teamIds = Object.keys(derivedTeams);
  // Default to "create" if user has no teams (but not for guests - they'll get the login prompt)
  const [selectedTeam, setSelectedTeam] = useState(teamIds.length > 0 ? teamIds[0] : "create");
  const [newRoomName, setNewRoomName] = useState("");
  const [roomCreationError, setRoomCreationError] = useState("");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showInviteModal, setShowInviteModal] = useState<Room | null>(null);

  const [showMembersModal, setShowMembersModal] = useState<Room | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showTeamInviteModal, setShowTeamInviteModal] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState<Room | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamCreationError, setTeamCreationError] = useState("");
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
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Store active counts for each room
  const [roomActiveCounts, setRoomActiveCounts] = useState<Record<string, number>>({});
  // Store all users for each room (both active and idle)
  const [roomUsers, setRoomUsers] = useState<
    Record<
      string,
      Array<{ userId: string; firstName?: string; lastName?: string; picture?: string | null; isActive: boolean }>
    >
  >({});
  // Store ephemeral rooms from Firebase
  const [ephemeralRooms, setEphemeralRooms] = useState<Room[]>([]);

  // Store user last active data from PostgreSQL
  const [userLastActiveData, setUserLastActiveData] = useState<
    Record<
      string,
      {
        last_active: string;
        auth_id: string;
        first_name: string;
        last_name: string;
        profile_image: string | null;
      }
    >
  >({});

  // Store user presence status from Firebase
  const [userPresenceStatus, setUserPresenceStatus] = useState<
    Record<
      string,
      {
        isOnline: boolean;
        isActive: boolean;
      }
    >
  >({});

  // Update flag when disclaimer is dismissed
  useEffect(() => {}, []);

  // Fetch user last_active data once when teams tab opens
  useEffect(() => {
    if (activeTab !== "team") {
      return;
    }

    const fetchUserLastActive = async () => {
      // Get all unique user IDs from team members
      const userIds = new Set<string>();
      Object.values(derivedTeams).forEach((team) => {
        team.members?.forEach((member) => {
          if (member.id) {
            userIds.add(member.id);
          }
        });
      });

      if (userIds.size === 0) return;

      try {
        const response = await fetch("/api/users/last-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: Array.from(userIds) }),
        });

        if (response.ok) {
          const data = await response.json();
          setUserLastActiveData(data);
        }
      } catch (error) {
        console.error("Failed to fetch user last active data:", error);
      }
    };

    // Fetch once when switching to Teams tab
    if (Object.keys(derivedTeams).length > 0) {
      fetchUserLastActive();
    }
  }, [activeTab, derivedTeams]); // Depend on activeTab and derivedTeams

  // Fetch Firebase Presence for team members with real-time updates
  useEffect(() => {
    if (activeTab !== "team") {
      // Clear presence data when leaving Teams tab
      setUserPresenceStatus({});
      return;
    }

    // Get all team members' authIds from current state
    const teamMemberAuthIds = new Set<string>();
    Object.values(derivedTeams).forEach((team) => {
      team.members?.forEach((member) => {
        if (member.authId) {
          teamMemberAuthIds.add(member.authId);
        }
      });
    });

    if (teamMemberAuthIds.size === 0) {
      return;
    }

    // Store listeners for cleanup
    const listeners: Array<() => void> = [];

    // Set up real-time listeners for each team member
    teamMemberAuthIds.forEach((authId) => {
      const presenceRef = ref(rtdb, `Presence/${authId}`);

      const handlePresenceUpdate = (snapshot: import("firebase/database").DataSnapshot) => {
        if (snapshot.exists()) {
          const presenceData = snapshot.val();

          let isOnline = false;
          let isActive = false;

          // Check if user has any sessions
          if (presenceData.sessions) {
            const now = Date.now();
            Object.values(presenceData.sessions).forEach((session: unknown) => {
              const sessionData = session as { lastSeen?: number; isActive?: boolean };
              // Consider online if lastSeen is within 65 seconds
              if (typeof sessionData.lastSeen === "number" && now - sessionData.lastSeen < 65000) {
                isOnline = true;
                if (sessionData.isActive === true) {
                  isActive = true;
                }
              }
            });
          }

          // Only update if status actually changed
          setUserPresenceStatus((prev) => {
            const currentStatus = prev[authId];
            if (!currentStatus || currentStatus.isOnline !== isOnline || currentStatus.isActive !== isActive) {
              // Status changed, update it
              return {
                ...prev,
                [authId]: { isOnline, isActive },
              };
            }
            // No change, return previous state
            return prev;
          });
        } else {
          // User has no presence data
          setUserPresenceStatus((prev) => ({
            ...prev,
            [authId]: { isOnline: false, isActive: false },
          }));
        }
      };

      // Set up listener
      onValue(presenceRef, handlePresenceUpdate);

      // Store cleanup function
      listeners.push(() => off(presenceRef, "value", handlePresenceUpdate));
    });

    // Cleanup function
    return () => {
      listeners.forEach((cleanup) => cleanup());
      setUserPresenceStatus({});
    };
  }, [activeTab, derivedTeams]); // Depend on activeTab and derivedTeams

  // Helper function to format relative time
  const formatRelativeTime = (lastActiveStr: string): string => {
    const lastActive = new Date(lastActiveStr);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Less than 1 minute
    if (diffMinutes < 1) return "Just now";
    
    // 1-60 minutes: show in minutes
    if (diffMinutes === 1) return "1 minute ago";
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    
    // 1-72 hours: show in hours (rounded up)
    const roundedUpHours = Math.ceil(diffMinutes / 60);
    if (roundedUpHours === 1) return "1 hour ago";
    if (roundedUpHours <= 72) return `${roundedUpHours} hours ago`;
    
    // After 72 hours: show in days
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;

    // After 30 days: show in months
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return "1mo ago";
    return `${diffMonths}mo ago`;
  };

  // Update myRoomsOrder when rooms change
  useEffect(() => {
    const allRooms = [...reduxRooms.map((r) => ({ ...r, members: r.members || [] })), ...ephemeralRooms];
    const allRoomIds = allRooms.map((room) => room.id);

    setMyRoomsOrder((prevOrder) => {
      // Update order if there are new rooms or rooms have been removed
      const hasNewRooms = allRoomIds.some((id) => !prevOrder.includes(id));
      const hasRemovedRooms = prevOrder.some((id) => !allRoomIds.includes(id));

      if (hasNewRooms || hasRemovedRooms) {
        // Keep existing order for rooms that still exist, append new rooms
        const existingOrder = prevOrder.filter((id) => allRoomIds.includes(id));
        const newRoomIds = allRoomIds.filter((id) => !prevOrder.includes(id));
        return [...existingOrder, ...newRoomIds];
      }

      // Return previous order if no changes needed
      return prevOrder;
    });
  }, [reduxRooms, ephemeralRooms]);

  // Listen to Firebase Presence to get active user counts and user data for each room
  useEffect(() => {
    // Create listeners for both Presence and Users
    const presenceRef = ref(rtdb, "Presence");
    const usersRef = ref(rtdb, "Users");

    let presenceData: Record<string, { sessions?: Record<string, unknown> }> | null = null;
    let usersData: Record<string, { firstName?: string; lastName?: string; picture?: string }> | null = null;
    let postgresUsers: Record<string, { firstName: string; lastName: string; profileImage: string | null }> | null =
      null;

    const updateRoomData = async () => {
      if (!presenceData || !usersData) return;

      // Fetch PostgreSQL users if we haven't already or if presence data changed
      if (!postgresUsers && presenceData) {
        const authIds = Object.keys(presenceData);
        if (authIds.length > 0) {
          try {
            const response = await fetch("/api/users/by-auth-ids", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ authIds }),
            });
            if (response.ok) {
              const data = await response.json();
              postgresUsers = data.users || {};
            }
          } catch (error) {
            console.error("Failed to fetch PostgreSQL users:", error);
          }
        }
      }

      const roomCounts: Record<string, number> = {};
      const roomUsers: Record<
        string,
        Array<{ userId: string; firstName?: string; lastName?: string; picture?: string | null; isActive: boolean }>
      > = {};

      // Iterate through all users in Presence
      for (const [userId, userData] of Object.entries(presenceData)) {
        const userSessions = (userData as { sessions?: Record<string, unknown> }).sessions;
        if (!userSessions) continue;

        // Get user data - prefer PostgreSQL, fallback to Firebase Users
        const pgUser = postgresUsers?.[userId];
        const fbUser = usersData[userId];
        const userInfo = pgUser
          ? {
              firstName: pgUser.firstName,
              lastName: pgUser.lastName,
              picture: pgUser.profileImage,
            }
          : fbUser;

        // Check each session for this user
        for (const [, sessionData] of Object.entries(userSessions)) {
          const session = sessionData as {
            roomId?: string;
            isActive?: boolean;
            userId?: string;
            users?: Record<string, unknown>;
          };

          // Process all sessions that have a roomId (both active and idle)
          if (session.roomId) {
            // Find the room that matches this Firebase roomId
            const matchingReduxRoom = reduxRooms.find((r) => r.firebaseId === session.roomId);
            const matchingEphemeralRoom = ephemeralRooms.find((r) => r.firebaseId === session.roomId);
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
              const existingUser = roomUsers[matchingRoom.id].find((u) => u.userId === userId);
              if (!existingUser) {
                roomUsers[matchingRoom.id].push({
                  userId,
                  firstName: userInfo?.firstName || "",
                  lastName: userInfo?.lastName || "",
                  picture: userInfo?.picture || null,
                  isActive: session.isActive || false,
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
      const usersChanged =
        oldUserIds.length !== newUserIds.length || !oldUserIds.every((id) => newUserIds.includes(id));

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
      off(presenceRef, "value", handlePresenceUpdate);
      off(usersRef, "value", handleUsersUpdate);
    };
  }, [reduxRooms, ephemeralRooms]);

  // Listen to Firebase EphemeralRooms for temporary rooms
  useEffect(() => {
    const ephemeralRoomsRef = ref(rtdb, "EphemeralRooms");

    const handleRoomsUpdate = (snapshot: import("firebase/database").DataSnapshot) => {
      if (!snapshot.exists()) {
        setEphemeralRooms([]);
        return;
      }

      const ephemeralRoomsData = snapshot.val();

      const ephemeralRoomsList: Room[] = [];

      // Process each room from Firebase EphemeralRooms
      for (const [roomId, roomData] of Object.entries(ephemeralRoomsData)) {
        const room = roomData as {
          url?: string;
          name?: string;
          userCount?: number;
          createdBy?: string;
          createdAt?: number;
        };

        // Extract room URL from the data
        const roomUrl = room.url ? `/${room.url}` : `/${roomId}`;

        // Ephemeral rooms by definition don't exist in PostgreSQL
        // Just add all ephemeral rooms from Firebase
        if (room.url && room.name) {
          const ephemeralRoom = {
            id: `ephemeral-${roomId}`, // Prefix to avoid ID conflicts
            name: room.name || room.url || `temp-room-${roomId.slice(-4)}`, // Use the formatted name
            url: roomUrl,
            type: "public" as const,
            firebaseId: roomId,
            members: [],
            activeCount: room.userCount || 0,
            weeklyStats: {
              totalTime: "0m",
              totalTasks: 0,
            },
            description: "This room will close when empty",
            createdBy: room.createdBy || "Anonymous",
            isPinned: false,
            isOwner: false,
            isAdmin: false,
            admins: [],
            maxMembers: 50,
            isEphemeral: true, // Mark as ephemeral
            createdAt: room.createdAt,
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
      off(ephemeralRoomsRef, "value", handleRoomsUpdate);
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
    const allRooms = [...reduxRooms.map((r) => ({ ...r, members: r.members || [] })), ...ephemeralRooms];
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
        const cleanUrlA = a.url.replace(/^\//, "").toLowerCase();
        const cleanUrlB = b.url.replace(/^\//, "").toLowerCase();
        const cleanCurrentUrl = currentRoomUrl.replace(/^\//, "").toLowerCase();

        const isCurrentA = cleanUrlA === cleanCurrentUrl;
        const isCurrentB = cleanUrlB === cleanCurrentUrl;

        // Debug logging removed to prevent infinite loop

        // Current room always first
        if (isCurrentA && !isCurrentB) return -1;
        if (!isCurrentA && isCurrentB) return 1;

        // If neither is current room, sort by type: private -> public -> ephemeral
        const isPrivateA = a.type === "private";
        const isPrivateB = b.type === "private";
        const isPublicA = a.type === "public" && !a.isEphemeral && !a.id.startsWith("ephemeral-");
        const isPublicB = b.type === "public" && !b.isEphemeral && !b.id.startsWith("ephemeral-");
        const isEphemeralA = a.isEphemeral || a.id.startsWith("ephemeral-");
        const isEphemeralB = b.isEphemeral || b.id.startsWith("ephemeral-");

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
      return filteredRooms.filter((r) => r.type === "private" && !r.id.startsWith("ephemeral-"));
    } else {
      // Default sort by active count for quick-join
      return [...filteredRooms].sort((a, b) => b.activeCount - a.activeCount);
    }
  }, [activeTab, searchQuery, myRoomsOrder, reduxRooms, ephemeralRooms, currentRoomUrl]);

  // const totalActiveUsers = reduxRooms.reduce((sum, room) => sum + room.activeCount, 0); // Unused - commented out
  const [globalActiveUsers, setGlobalActiveUsers] = useState(0);
  // const [globalActiveRooms, setGlobalActiveRooms] = useState(0);

  // Listen to real-time online user count and public room count
  useEffect(() => {
    // Initial fetch for online users
    const fetchOnlineUsers = async () => {
      try {
        const count = await PresenceService.getTotalOnlineUsers();
        setGlobalActiveUsers(count);
      } catch (error) {
        console.error("Failed to fetch online users:", error);
      }
    };

    fetchOnlineUsers();

    // Listen to real-time user changes
    const unsubscribeUsers = PresenceService.listenToTotalOnlineUsers((count) => {
      setGlobalActiveUsers(count);
    });

    // Listen to real-time room count (public + active private)
    const publicRoomsRef = ref(rtdb, "PublicRooms");
    const privateRoomsRef = ref(rtdb, "PrivateRooms");

    // let publicCount = 0;
    // let privateWithUsersCount = 0;

    // const updateTotalRooms = () => {
    //   setGlobalActiveRooms(publicCount + privateWithUsersCount);
    // };

    // Listen to public rooms
    const publicRoomHandler = (snapshot: { exists: () => boolean; val: () => Record<string, unknown> }) => {
      if (snapshot.exists()) {
        // const rooms = snapshot.val();
        // publicCount = Object.keys(rooms).length;
      } else {
        // publicCount = 0;
      }
      // updateTotalRooms();
    };

    // Listen to private rooms
    const privateRoomHandler = (snapshot: { exists: () => boolean; val: () => Record<string, unknown> }) => {
      if (snapshot.exists()) {
        // const rooms = snapshot.val();
        // Count private rooms with at least 1 user
        // privateWithUsersCount = Object.values(rooms).filter((room) =>
        //   (room as { userCount?: number }).userCount && (room as { userCount?: number }).userCount! > 0
        // ).length;
      } else {
        // privateWithUsersCount = 0;
      }
      // updateTotalRooms();
    };

    onValue(publicRoomsRef, publicRoomHandler);
    onValue(privateRoomsRef, privateRoomHandler);

    return () => {
      unsubscribeUsers();
      off(publicRoomsRef, "value", publicRoomHandler);
      off(privateRoomsRef, "value", privateRoomHandler);
    };
  }, []);

  const handleJoinRoom = (roomUrl: string) => {
    onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(roomUrl as any);
  };

  const handleQuickJoin = async () => {
    try {
      // Get current user ID
      const userId = user?.user_id || "anonymous";

      // Get all public rooms (combining redux rooms and ephemeral rooms)
      const allPublicRooms = [...reduxRooms, ...ephemeralRooms].filter(
        (room) => room.type === "public" || !room.type // Some rooms might not have type specified
      );

      // Separate permanent rooms (like GSD) from ephemeral rooms
      const permanentRooms = allPublicRooms.filter(
        (room) => room.url === "gsd" || room.url === "/gsd" || reduxRooms.some((r) => r.id === room.id)
      );
      const ephemeralRoomsFiltered = allPublicRooms.filter(
        (room) => ephemeralRooms.some((e) => e.id === room.id) && room.url !== "gsd" && room.url !== "/gsd"
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
          const roomUrl = room.url.startsWith("/") ? room.url.substring(1) : room.url;
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
          const roomUrl = room.url.startsWith("/") ? room.url.substring(1) : room.url;
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

  // Handler for Quick Join text - always creates a new ephemeral room
  const handleQuickJoinTextClick = async () => {
    try {
      const userId = user?.user_id || "anonymous";
      // Always create a new ephemeral room, bypassing capacity checks
      await roomService.createRoomAndNavigate(userId);
    } catch (error) {
      console.error("Error creating ephemeral room:", error);
      // Fallback: try the regular quick join
      handleQuickJoin();
    }
  };

  const handleCreateRoom = () => {
    // Check if user is a guest
    if (user.isGuest !== false) {
      // Show login prompt for guests
      setShowLoginPrompt(true);
      return;
    }
    setShowCreateRoom(!showCreateRoom);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      // Get the current order from filteredRooms
      const currentOrder = filteredRooms.map((r) => r.id);
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over?.id as string);

      // Update myRoomsOrder with the new arrangement
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setMyRoomsOrder(newOrder);
    }

    setActiveId(null);
  };

  // const getStatusColor = (status: "online" | "idle" | "offline", task?: string) => {
  //   if (status === "online" && task && task.includes("Do not disturb")) {
  //     return "bg-red-500";
  //   }
  //   switch (status) {
  //     case "online":
  //       return "bg-green-500";
  //     case "idle":
  //       return "bg-yellow-500";
  //     case "offline":
  //       return "bg-gray-600";
  //     default:
  //       return "bg-gray-600";
  //   }
  // };

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
            className={`flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "experiment" ? "bg-[#FFAA00] text-black" : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => setActiveTab("team")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 cursor-pointer ${
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
                        <h3 
                          className="font-semibold text-gray-200 cursor-pointer hover:text-[#FFAA00] transition-colors"
                          onClick={handleQuickJoinTextClick}
                          title="Click to create a new ephemeral room"
                        >
                          Quick Join
                        </h3>
                        <p className="text-base text-gray-500">
                          <span className="text-green-500 font-bold">{globalActiveUsers.toLocaleString()}</span> people
                          online
                        </p>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">Instantly join a random room with active workers</p>
                    </div>
                  </div>
                  <button
                    onClick={handleQuickJoin}
                    className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB833] transition-all duration-200 flex items-center gap-2 flex-shrink-0 cursor-pointer"
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
                    className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-[#FFAA00] transition-all duration-200 flex items-center gap-2 whitespace-nowrap border border-gray-700 hover:border-[#FFAA00] cursor-pointer"
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
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Room Name</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="My Awesome Room"
                            value={newRoomName}
                            onChange={(e) => {
                              // Allow letters, numbers, spaces, but no special characters
                              const value = e.target.value.replace(/[^a-zA-Z0-9 ]/g, "");
                              setNewRoomName(value.slice(0, 30));
                              setRoomCreationError(""); // Clear error when typing
                            }}
                            maxLength={30}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                            {newRoomName.length}/30
                          </span>
                        </div>
                        {roomCreationError && (
                          <p className="text-xs text-red-500 mt-1">{roomCreationError}</p>
                        )}
                        {newRoomName && !roomCreationError && (
                          <>
                            <p className="text-xs text-gray-500 mt-1">
                              URL slug:{" "}
                              {newRoomName
                                .toLowerCase()
                                .replace(/\s+/g, "-")
                                .replace(/[^a-z0-9-]/g, "")}
                            </p>
                            <p className="text-xs text-[#FFAA00] mt-1">
                              Room URL: https://locked-in.work/
                              {newRoomName
                                .toLowerCase()
                                .replace(/\s+/g, "-")
                                .replace(/[^a-z0-9-]/g, "")}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!newRoomName || newRoomName.length < 3}
                          onClick={async () => {
                            if (!newRoomName || newRoomName.length < 3) return;

                            // Convert to slug format for URL
                            const roomSlug = newRoomName
                              .toLowerCase()
                              .replace(/\s+/g, "-")
                              .replace(/[^a-z0-9-]/g, "");

                            setRoomCreationError(""); // Clear any previous error
                            
                            try {
                              // Create the private room with both name and slug, using Firebase auth_id
                              await createPrivateRoom(user?.auth_id || "", roomSlug, newRoomName);

                              // Navigate to the new room
                              window.location.href = `/${roomSlug}`;
                            } catch (error) {
                              console.error("Error creating room:", error);
                              setRoomCreationError(`"${newRoomName}" is already taken. Please choose a different name.`);
                            }
                          }}
                        >
                          Create Room
                        </button>
                        <button
                          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                          onClick={() => {
                            setShowCreateRoom(false);
                            setNewRoomName("");
                            setRoomCreationError("");
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
                  <SortableContext items={filteredRooms.map((r) => r.id)} strategy={rectSortingStrategy}>
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
                            currentUser={user}
                            firebaseUserId={firebaseUser.id}
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
                const currentTeam = derivedTeams[selectedTeam] ||
                  derivedTeams[teamIds[0]] || {
                    rooms: [],
                    members: [],
                    description: "Your workspace",
                  };
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

                // Use the team members
                const rawMembers = currentTeam.members.length > 0
                    ? currentTeam.members.map((member) => ({
                        ...member,
                        rooms: [], // Nexus team members aren't in any rooms yet
                      }))
                    : Array.from(allTeamMembers.values());
                
                // The API should have already filtered out the superadmin
                // This is just for safety - filter out the superadmin ID if it somehow appears
                const SUPERADMIN_ID = "df3aed2a-ad51-457f-b0cd-f7d4225143d4";
                const teamMembers = rawMembers.filter(m => m.id !== SUPERADMIN_ID);

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
                          {/* Only show X button if user has teams to go back to */}
                          {teamIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedTeam(teamIds[0]);
                                setNewTeamName("");
                                setTeamCreationError("");
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
                          )}
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
                                placeholder="My Awesome Team"
                                value={newTeamName}
                                onChange={(e) => {
                                  // Allow letters, numbers, spaces, but no special characters
                                  const value = e.target.value.replace(/[^a-zA-Z0-9 ]/g, '');
                                  setNewTeamName(value.slice(0, 30));
                                  setTeamCreationError(""); // Clear error when typing
                                }}
                                maxLength={30}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors pr-16"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                {newTeamName.length}/30
                              </span>
                            </div>
                            {teamCreationError && (
                              <p className="text-xs text-red-500 mt-1">{teamCreationError}</p>
                            )}
                            {newTeamName && !teamCreationError && (
                              <>
                                <p className="text-xs text-gray-500 mt-1">
                                  URL slug: {newTeamName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                                </p>
                                <p className="text-xs text-[#FFAA00] mt-1">
                                  Team URL: https://locked-in.work/{newTeamName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                                </p>
                              </>
                            )}
                          </div>
                          <button
                            disabled={!newTeamName.trim() || newTeamName.trim().length < 3}
                            onClick={async () => {
                              // Check if user is a guest
                              if (user.isGuest !== false) {
                                // Show login prompt for guests
                                setShowLoginPrompt(true);
                                return;
                              }
                              
                              if (!newTeamName.trim() || newTeamName.trim().length < 3) return;
                              
                              // Convert to slug format for URL
                              const teamSlug = newTeamName
                                .toLowerCase()
                                .replace(/\s+/g, "-")
                                .replace(/[^a-z0-9-]/g, "");
                              
                              setTeamCreationError(""); // Clear any previous error
                              
                              try {
                                // Create the team room with type='private'
                                await createTeamRoom(user?.auth_id || "", teamSlug, newTeamName);
                                
                                // Navigate to the new team room
                                window.location.href = `/${teamSlug}`;
                              } catch (error) {
                                console.error("Error creating team:", error);
                                setTeamCreationError(`"${newTeamName}" is already taken. Please choose a different name.`);
                              }
                            }}
                            className="px-6 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Create Team
                          </button>
                          {/* Only show Cancel button if user has teams to go back to */}
                          {teamIds.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedTeam(teamIds[0]);
                                setNewTeamName("");
                                setTeamCreationError("");
                                setInviteEmails("");
                              }}
                              className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Team Overview Header */}
                        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                          <div className="flex items-start justify-between mb-3">
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
                                    {teamIds.map((teamId) => (
                                      <option key={teamId} value={teamId}>
                                        {derivedTeams[teamId].name}
                                      </option>
                                    ))}
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
                              <p className="text-gray-400">{currentTeam.description}</p>
                            </div>
                            <button
                              onClick={() => setShowTeamInviteModal(true)}
                              className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center gap-2 cursor-pointer"
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
                          <div className="grid grid-cols-4 gap-4 mt-4">
                            <div className="text-center">
                              <p className="text-xl font-bold text-green-400">{totalActiveMembers}</p>
                              <p className="text-sm text-gray-500">Active Now</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-green-400">
                                {teamMembers.length}
                              </p>
                              <p className="text-sm text-gray-500">Total Team Members</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-green-400">{formatTotalTime(totalTime)}</p>
                              <p className="text-sm text-gray-500">Total Time Last 30 Days</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-green-400">{totalTasks}</p>
                              <p className="text-sm text-gray-500">Tasks Last 30 Days</p>
                            </div>
                          </div>
                        </div>

                        {/* Team Workspaces */}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-200 mb-3">Team Rooms ({teamRooms.length})</h3>
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
                                  // Check if user is a guest
                                  if (user.isGuest !== false) {
                                    // Show login prompt for guests
                                    setShowLoginPrompt(true);
                                    return;
                                  }
                                  setActiveTab("experiment");
                                  setShowCreateRoom(true);
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
                                          {room.id.startsWith("ephemeral-") && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                                              Temp
                                            </span>
                                          )}
                                        </h4>
                                        <p className="text-sm text-gray-500">
                                          {room.activeCount} active •{" "}
                                          {room.members?.filter((m) => m.id !== "6e756c03-9596-41bc-96ae-d8ede249a27a")
                                            .length || 0}{" "}
                                          members
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleJoinRoom(room.url)}
                                      className="px-4 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200 cursor-pointer"
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
                          <h3 className="text-lg font-semibold text-gray-200 mb-3">Team Members</h3>
                          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                            {sortedMembers
                              .filter((member) => member.id !== "6e756c03-9596-41bc-96ae-d8ede249a27a")
                              .map((member) => (
                                <div
                                  key={member.id}
                                  className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-all group"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="relative">
                                        {(() => {
                                          // Get profile picture from PostgreSQL data first
                                          const userData = userLastActiveData[member.id];
                                          // Check if this is the current user and use their animal avatar if available
                                          const isCurrentUser = member.id === firebaseUser.id || member.id === user.user_id || member.firebase_id === user.user_id;
                                          let profilePicture = isCurrentUser && user.profile_image 
                                            ? user.profile_image
                                            : (userData?.profile_image || member.picture || member.profileImage);
                                          
                                          // If no picture, check if guest and assign animal avatar
                                          if (!profilePicture) {
                                            const firstName = userData?.first_name || member.firstName || member.name?.split(" ")[0] || '';
                                            const lastName = userData?.last_name || member.lastName || member.name?.split(" ")[1] || '';
                                            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
                                            
                                            if (firstName === 'Guest' || firstName === '' || initials === '' || initials === 'U' || initials === 'GU') {
                                              // Generate consistent animal based on member id
                                              const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
                                              const animalIndex = member.id ? 
                                                member.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % animals.length :
                                                Math.floor(Math.random() * animals.length);
                                              profilePicture = `/${animals[animalIndex]}.png`;
                                            }
                                          }
                                          // const firstName = userData?.first_name || member.firstName || member.name.split(" ")[0] || '';
                                          // const lastName = userData?.last_name || member.lastName || member.name.split(" ")[1] || '';
                                          // const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || member.avatar || 'U';

                                          if (profilePicture && profilePicture.trim() !== "") {
                                            return (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                src={profilePicture}
                                                alt={member.name}
                                                className="w-12 h-12 rounded-full object-cover hover:ring-2 hover:ring-[#FFAA00] transition-all"
                                                onError={(e) => {
                                                  // If image fails to load, hide it and show initials
                                                  e.currentTarget.style.display = "none";
                                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                                  if (fallback) fallback.style.display = "flex";
                                                }}
                                              />
                                            );
                                          }
                                          return null;
                                        })()}
                                        <div
                                          className={`w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300 hover:ring-2 hover:ring-[#FFAA00] transition-all ${
                                            userLastActiveData[member.id]?.profile_image ||
                                            member.picture ||
                                            member.profileImage
                                              ? "hidden"
                                              : "flex"
                                          }`}
                                        >
                                          {(() => {
                                            const userData = userLastActiveData[member.id];
                                            const firstName =
                                              userData?.first_name ||
                                              member.firstName ||
                                              member.name.split(" ")[0] ||
                                              "";
                                            const lastName =
                                              userData?.last_name || member.lastName || member.name.split(" ")[1] || "";
                                            const initials = `${firstName.charAt(0)}${lastName.charAt(
                                              0
                                            )}`.toUpperCase();
                                            return initials.trim() || member.avatar || "U";
                                          })()}
                                        </div>
                                        <div
                                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${(() => {
                                            const presence = userPresenceStatus[member.authId || ""];
                                            if (presence?.isActive) {
                                              return "bg-green-500 animate-pulse";
                                            } else if (presence?.isOnline) {
                                              return "bg-yellow-500";
                                            }
                                            return "bg-gray-600";
                                          })()}`}
                                        />
                                      </div>
                                      <div className="flex-1">
                                        <h4 className="font-medium text-gray-200 hover:text-[#FFAA00] transition-colors">
                                          {member.name}
                                        </h4>
                                        <div className="flex items-center gap-2 text-sm">
                                          <p className="text-gray-500">
                                            {(() => {
                                              const presence = userPresenceStatus[member.authId || ""];
                                              if (presence?.isActive) {
                                                return "Actively working";
                                              } else if (presence?.isOnline) {
                                                return "Standby";
                                              } else {
                                                // Offline - show last seen from actual data
                                                const userData = userLastActiveData[member.id];
                                                if (userData?.last_active) {
                                                  return `Last seen ${formatRelativeTime(userData.last_active)}`;
                                                }
                                                // Fallback if no data available
                                                return `Last seen recently`;
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
                        {room.id.startsWith("ephemeral-") ? (
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
                        <svg
                          className="w-3.5 h-3.5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                        <span className="font-mono text-xs">
                          locked-in{room.url.startsWith("/") ? room.url : `/${room.url}`}
                        </span>
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
                        <div className="font-medium text-gray-400">{room.weeklyStats?.totalTime || "Null"}</div>
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
                            const roomUser = sortedUsers[i];
                            const firstName = roomUser.firstName || "";
                            const lastName = roomUser.lastName || "";
                            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
                            const displayInitials = initials.trim() || "U";
                            const fullName = `${firstName} ${lastName}`.trim() || "Unknown User";
                            
                            // Check if this is the current user and use their animal avatar if available
                            // For guest users, the roomUser.userId will be the Firebase UID
                            const isCurrentUser = roomUser.userId === firebaseUser.id || roomUser.userId === user.user_id;
                            let avatarSrc = isCurrentUser && user.profile_image 
                              ? user.profile_image 
                              : roomUser.picture;
                            
                            // If no picture and user appears to be a guest (no real name), use animal avatar
                            if (!avatarSrc && (firstName === 'Guest' || firstName === '' || displayInitials === 'U' || displayInitials === 'GU')) {
                              // Generate consistent animal based on userId
                              const animals = ['bear', 'owl', 'tiger', 'turtle', 'wolf'];
                              const animalIndex = roomUser.userId ? 
                                roomUser.userId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % animals.length :
                                Math.floor(Math.random() * animals.length);
                              avatarSrc = `/${animals[animalIndex]}.png`;
                            }

                            displayItems.push(
                              <div
                                key={roomUser.userId}
                                className="relative"
                                title={`${fullName}${roomUser.isActive ? " - Active" : " - Idle"}`}
                              >
                                {avatarSrc && avatarSrc.trim() !== "" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={avatarSrc}
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
                                  <div className="w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium bg-gray-600 text-gray-200">
                                    {displayInitials}
                                  </div>
                                )}
                                <div
                                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                                    roomUser.isActive ? "bg-green-500" : "bg-yellow-500"
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
                        : "bg-gray-700 text-gray-300 hover:bg-[#FFAA00] hover:text-black cursor-pointer"
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                        <span className="text-gray-300 font-mono text-sm">
                          locked-in{editingRoom.url.startsWith("/") ? editingRoom.url : `/${editingRoom.url}`}
                        </span>
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
                              const userData = userLastActiveData[member.id];
                              if (userData?.last_active) {
                                return `Last seen ${formatRelativeTime(userData.last_active)}`;
                              }
                              return `Last seen ${member.duration || "recently"}`;
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
                      // Show coming soon message
                      alert("Feature coming soon!");
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

      {/* Login Prompt Modal for Guests */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full relative animate-fadeIn">
            {/* Close Button */}
            <button
              onClick={() => setShowLoginPrompt(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#FFAA00] to-[#FF6B00] rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-3">
              Sign In to Create Rooms
            </h2>

            {/* Description */}
            <p className="text-gray-400 text-center mb-8">
              Creating private rooms requires an account. Sign in to unlock all features and collaborate with your team.
            </p>

            {/* Google Sign In Button */}
            <button
              onClick={async () => {
                try {
                  await signInWithGoogle();
                  setShowLoginPrompt(false);
                } catch (error) {
                  console.error("Sign in failed:", error);
                }
              }}
              className="w-full bg-white text-black font-bold py-3 px-4 rounded-lg hover:bg-gray-100 transition-all duration-200 flex items-center justify-center gap-3 mb-4"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-500">or</span>
              </div>
            </div>

            {/* Manual Sign In */}
            <button
              onClick={() => {
                setShowLoginPrompt(false);
                // You might want to trigger a sign-in modal here
                // For now, we'll just use the SignIn component
              }}
              className="w-full text-gray-400 hover:text-white text-sm transition-colors"
            >
              Sign in with email
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkSpace;
