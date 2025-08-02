"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface RoomsProps {
  onClose: () => void;
}

type TabType = "my-rooms" | "public" | "private";

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
}

// Mock data for rooms with various members and activities
const MOCK_ROOMS: Room[] = [
  {
    id: "1",
    name: "Focus Flow",
    url: "/focus-flow",
    type: "public",
    activeCount: 3,
    isPinned: true,
    members: [
      { id: "1", name: "Alex Chen", avatar: "AC", status: "online", task: "Building React components", duration: "45m" },
      { id: "6", name: "Lisa Anderson", avatar: "LA", status: "online", task: "UI/UX design", duration: "30m" },
      { id: "20", name: "Ashley Rodriguez", avatar: "AR", status: "online", task: "Marketing strategy", duration: "1h 5m" },
      { id: "21", name: "Sam Wilson", avatar: "SW", status: "idle" },
      { id: "22", name: "Jordan Lee", avatar: "JL", status: "offline" },
      // Adding many more offline/idle members to reach 113 total
      ...Array.from({ length: 108 }, (_, i) => ({
        id: `ff-${i + 100}`,
        name: `User ${i + 100}`,
        avatar: `U${i % 99}`,
        status: "offline" as const,
      })),
    ],
    weeklyStats: {
      totalTime: "127h 45m",
      totalTasks: 234,
    },
    description: "High-intensity focus sessions for deep work",
    isOwner: true,
    admins: ["Alex Chen", "Lisa Anderson"],
    maxMembers: 150,
  },
  {
    id: "2",
    name: "Deep Work",
    url: "/deep-work",
    type: "public",
    activeCount: 2,
    members: [
      { id: "2", name: "Sarah Johnson", avatar: "SJ", status: "online", task: "Writing documentation", duration: "1h 23m" },
      { id: "8", name: "Jennifer Taylor", avatar: "JT", status: "online", task: "Data analysis", duration: "1h 45m" },
      { id: "23", name: "Chris Martin", avatar: "CM", status: "idle" },
      { id: "24", name: "Pat Brown", avatar: "PB", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "89h 30m",
      totalTasks: 156,
    },
    description: "Distraction-free environment for complex tasks",
  },
  {
    id: "3",
    name: "Study Hall",
    url: "/study-hall",
    type: "public",
    activeCount: 2,
    members: [
      { id: "4", name: "Emma Davis", avatar: "ED", status: "online", task: "Machine learning research", duration: "2h 10m" },
      { id: "11", name: "Chris Lee", avatar: "CL", status: "idle" },
      { id: "25", name: "Morgan Taylor", avatar: "MT", status: "online", task: "Reading papers", duration: "55m" },
      { id: "26", name: "Jamie Kim", avatar: "JK", status: "offline" },
      { id: "27", name: "Drew Smith", avatar: "DS", status: "offline" },
      { id: "28", name: "Casey Jones", avatar: "CJ", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "156h 20m",
      totalTasks: 289,
    },
    description: "Academic focus and research collaboration",
  },
  {
    id: "4",
    name: "Productivity Lab",
    url: "/productivity-lab",
    type: "public",
    activeCount: 1,
    members: [
      { id: "3", name: "Mike Williams", avatar: "MW", status: "idle" },
      { id: "14", name: "Rachel Green", avatar: "RG", status: "online", task: "Project planning", duration: "40m" },
      { id: "29", name: "Alex Park", avatar: "AP", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "67h 15m",
      totalTasks: 123,
    },
    description: "Experiment with productivity techniques",
  },
  {
    id: "5",
    name: "Grind Time",
    url: "/grind-time",
    type: "public",
    activeCount: 2,
    members: [
      { id: "7", name: "David Brown", avatar: "DB", status: "idle" },
      { id: "18", name: "Jessica Lewis", avatar: "JL", status: "online", task: "Research paper", duration: "2h 30m" },
      { id: "30", name: "Tony Stark", avatar: "TS", status: "online", task: "Building AI", duration: "4h 20m" },
      { id: "31", name: "Bruce Wayne", avatar: "BW", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "203h 40m",
      totalTasks: 412,
    },
    description: "Push your limits with marathon work sessions",
  },
  {
    id: "6",
    name: "Team Alpha Sprint",
    url: "/team-alpha",
    type: "private",
    activeCount: 7,
    isPinned: true,
    members: [
      { id: "32", name: "Elena Rodriguez", avatar: "ER", status: "online", task: "Sprint planning", duration: "25m" },
      { id: "33", name: "Marcus Chen", avatar: "MC", status: "online", task: "Code review", duration: "1h 10m" },
      { id: "34", name: "Priya Patel", avatar: "PP", status: "online", task: "API development", duration: "3h 45m" },
      { id: "35", name: "James Wilson", avatar: "JW", status: "online", task: "Testing", duration: "2h 20m" },
      { id: "36", name: "Sofia Martinez", avatar: "SM", status: "online", task: "Database migration", duration: "45m" },
      { id: "37", name: "Alex Thompson", avatar: "AT", status: "online", task: "Frontend refactor", duration: "1h 30m" },
      { id: "38", name: "Nina Patel", avatar: "NP", status: "online", task: "Documentation", duration: "55m" },
      { id: "39", name: "Carlos Ruiz", avatar: "CR", status: "idle" },
    ],
    weeklyStats: {
      totalTime: "312h 50m",
      totalTasks: 567,
    },
    description: "Private room for Alpha team's sprint work",
    createdBy: "Elena Rodriguez",
    isAdmin: true,
    admins: ["Elena Rodriguez", "Marcus Chen"],
    maxMembers: 10,
  },
  {
    id: "7",
    name: "Creative Studio",
    url: "/creative-studio",
    type: "public",
    activeCount: 1,
    members: [
      { id: "16", name: "Nicole Adams", avatar: "NA", status: "online", task: "Video editing", duration: "1h 15m" },
      { id: "37", name: "Maya Johnson", avatar: "MJ", status: "offline" },
      { id: "38", name: "Leo Wang", avatar: "LW", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "45h 30m",
      totalTasks: 78,
    },
    description: "For designers, artists, and content creators",
  },
  {
    id: "8",
    name: "Coding Dojo",
    url: "/coding-dojo",
    type: "public",
    activeCount: 1,
    members: [
      { id: "10", name: "Maria Garcia", avatar: "MG", status: "online", task: "Backend development", duration: "3h 20m" },
      { id: "39", name: "Ryan Thompson", avatar: "RT", status: "offline" },
      { id: "40", name: "Zoe Chen", avatar: "ZC", status: "idle" },
      { id: "41", name: "Omar Hassan", avatar: "OH", status: "offline" },
      { id: "42", name: "Kim Lee", avatar: "KL", status: "offline" },
    ],
    weeklyStats: {
      totalTime: "189h 25m",
      totalTasks: 345,
    },
    description: "Master your coding skills together",
  },
  {
    id: "9",
    name: "Writers' Room",
    url: "/writers-room",
    type: "private",
    activeCount: 0,
    members: [
      { id: "43", name: "Emily Chen", avatar: "EC", status: "offline" },
      { id: "44", name: "Noah Williams", avatar: "NW", status: "offline" },
      { id: "45", name: "Ava Brown", avatar: "AB", status: "idle" },
    ],
    weeklyStats: {
      totalTime: "23h 10m",
      totalTasks: 42,
    },
    description: "Private space for focused writing sessions",
    createdBy: "Emily Chen",
  },
];

const Rooms: React.FC<RoomsProps> = ({ onClose }) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("my-rooms");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomType, setNewRoomType] = useState<"public" | "private">("public");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showInviteModal, setShowInviteModal] = useState<Room | null>(null);
  const [showMembersModal, setShowMembersModal] = useState<Room | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState<Room | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  // Get current room URL to highlight it
  const currentRoomUrl = typeof window !== "undefined" ? window.location.pathname : "";

  // Filter rooms based on search and tab
  const filteredRooms = useMemo(() => {
    let rooms = MOCK_ROOMS;
    
    if (activeTab === "public") {
      rooms = rooms.filter(r => r.type === "public");
    } else if (activeTab === "private") {
      rooms = rooms.filter(r => r.type === "private");
    }
    
    if (searchQuery) {
      rooms = rooms.filter(r => 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.members.some(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    // Sort: pinned first, then by active count
    return rooms.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.activeCount - a.activeCount;
    });
  }, [activeTab, searchQuery]);

  const publicRoomsCount = MOCK_ROOMS.filter(r => r.type === "public").length;
  const privateRoomsCount = MOCK_ROOMS.filter(r => r.type === "private").length;
  const totalActiveUsers = MOCK_ROOMS.reduce((sum, room) => sum + room.activeCount, 0);

  const handleJoinRoom = (roomUrl: string) => {
    onClose();
    router.push(roomUrl);
  };

  const getStatusColor = (status: "online" | "idle" | "offline") => {
    switch (status) {
      case "online": return "bg-green-500";
      case "idle": return "bg-yellow-500";
      case "offline": return "bg-gray-600";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[900px] h-[85vh] flex flex-col border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Rooms</h2>
          
          {/* Stats Badge */}
          <div className="absolute left-0 flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-gray-800 rounded-full">
              {totalActiveUsers} active
            </span>
          </div>
          
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
            onClick={() => setActiveTab("my-rooms")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === "my-rooms"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            My Rooms
          </button>
          <button
            onClick={() => setActiveTab("public")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === "public"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Public
            <span className={`text-xs ${
              activeTab === "public" ? "text-black/70" : "text-gray-500"
            }`}>({publicRoomsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab("private")}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === "private"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Private
            <span className={`text-xs ${
              activeTab === "private" ? "text-black/70" : "text-gray-500"
            }`}>({privateRoomsCount})</span>
          </button>
        </div>

        {/* Search and Create Room */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
            />
          </div>
          <button
            onClick={() => setShowCreateRoom(!showCreateRoom)}
            className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-[#FFAA00] hover:text-[#FFAA00] transition-colors flex items-center gap-2"
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
              <input
                type="text"
                placeholder="Room name..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
              />
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
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
                  onClick={() => {
                    // Handle create room
                    setNewRoomName("");
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
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rooms Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-lg font-medium">No rooms found</p>
              <p className="text-sm text-gray-600">Try a different search or create a new room</p>
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
                        {room.isPinned && (
                          <svg className="w-4 h-4 text-[#FFAA00]" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                          </svg>
                        )}
                        <h3 className="font-semibold text-gray-200">{room.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          room.type === "private" 
                            ? "bg-purple-500/20 text-purple-400" 
                            : "bg-blue-500/20 text-blue-400"
                        }`}>
                          {room.type}
                        </span>
                      </div>
                      {room.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{room.description}</p>
                      )}
                    </div>
                    
                    <div className="flex items-start gap-2">
                      {/* Admin Menu */}
                      {(room.isOwner || room.isAdmin) && (
                        <div className="relative group/menu">
                          <button 
                            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRoom(room);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      
                      {/* Quick Stats */}
                      <div className="text-right text-xs text-gray-500">
                        <div className="font-medium text-gray-400">{room.weeklyStats.totalTime}</div>
                        <div>{room.weeklyStats.totalTasks} tasks</div>
                        <div className="text-[10px] mt-1">this week</div>
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
                        const maxVisible = 5;
                        const hasOverflow = room.members.length > maxVisible;
                        const membersToShow = hasOverflow ? 4 : room.members.length;
                        
                        // Sort members by status: online > idle > offline
                        const statusOrder = { online: 0, idle: 1, offline: 2 };
                        const sortedMembers = [...room.members].sort((a, b) => 
                          statusOrder[a.status] - statusOrder[b.status]
                        );
                        
                        // Add member avatars
                        for (let i = 0; i < membersToShow; i++) {
                          const member = sortedMembers[i];
                          displayItems.push(
                            <div
                              key={member.id}
                              className="relative"
                              title={`${member.name}${member.task ? ` - ${member.task}` : ''}`}
                            >
                              <div className={`w-8 h-8 rounded-full border-2 border-gray-900 flex items-center justify-center text-xs font-medium ${
                                member.status === "offline" ? "bg-gray-700 text-gray-400" : "bg-gray-600 text-gray-200"
                              }`}>
                                {member.avatar}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${getStatusColor(member.status)}`} />
                            </div>
                          );
                        }
                        
                        // Add overflow indicator as just another item in the sequence
                        if (hasOverflow) {
                          const overflowCount = room.members.length - 4;
                          displayItems.push(
                            <div key="overflow" className="relative">
                              <div className="w-8 h-8 rounded-full border-2 border-gray-900 bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-400">
                                {overflowCount > 99 ? '99+' : `+${overflowCount}`}
                              </div>
                            </div>
                          );
                        }
                        
                        return displayItems;
                      })()}
                    </div>
                    <span className="text-sm text-gray-400">
                      {room.activeCount > 0 ? (
                        <span className="text-green-400">{room.activeCount} active</span>
                      ) : (
                        <span className="text-gray-500">No one active</span>
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
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={(e) => {
          e.stopPropagation();
          setEditingRoom(null);
        }}>
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[95%] max-w-[600px] max-h-[90vh] overflow-y-auto border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#FFAA00]">Room Settings</h3>
              <button
                onClick={() => setEditingRoom(null)}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
              >
                <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
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
                  <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                  <textarea
                    defaultValue={editingRoom.description}
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-[#FFAA00] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Room Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="roomType"
                        defaultChecked={editingRoom.type === "public"}
                        className="text-[#FFAA00]"
                      />
                      <span className="text-sm text-gray-300">Public</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="roomType"
                        defaultChecked={editingRoom.type === "private"}
                        className="text-[#FFAA00]"
                      />
                      <span className="text-sm text-gray-300">Private</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Max Members</label>
                  <input
                    type="number"
                    defaultValue={editingRoom.maxMembers || 50}
                    min="2"
                    max="100"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-[#FFAA00]"
                  />
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t border-gray-700 pt-6">
                <h4 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setShowMembersModal(editingRoom);
                      setEditingRoom(null);
                      setMemberSearchQuery("");
                    }}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Manage Members
                  </button>
                  <button
                    onClick={() => {
                      setShowInviteModal(editingRoom);
                      setEditingRoom(null);
                    }}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Invite People
                  </button>
                </div>
              </div>

              {/* Danger Zone */}
              {editingRoom.isOwner && (
                <div className="border-t border-gray-700 pt-6">
                  <h4 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h4>
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
                </div>
              )}

              {/* Action Buttons */}
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
            </div>
          </div>
        </div>
      )}

      {/* Members Management Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={(e) => {
          e.stopPropagation();
          setShowMembersModal(null);
          setMemberSearchQuery("");
        }}>
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[95%] max-w-[700px] max-h-[90vh] overflow-y-auto border border-gray-800 custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-[#FFAA00]">Manage Members</h3>
                <p className="text-sm text-gray-500 mt-1">{showMembersModal.members.length} members • {showMembersModal.maxMembers || 50} max</p>
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
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setShowMembersModal(null);
                    setMemberSearchQuery("");
                  }}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                .filter(member => 
                  member.name.toLowerCase().includes(memberSearchQuery.toLowerCase())
                )
                .map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300">
                        {member.avatar}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(member.status)}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-200">{member.name}</p>
                      <p className="text-xs text-gray-500">
                        {showMembersModal.admins?.includes(member.name) && (
                          <span className="text-[#FFAA00]">Admin • </span>
                        )}
                        {member.status === "online" ? "Active now" : `Last seen ${member.duration || "recently"}`}
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
              <h4 className="text-sm font-medium text-gray-400 mb-3">Room Admins ({showMembersModal.admins?.length || 0})</h4>
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={(e) => {
          e.stopPropagation();
          setShowInviteModal(null);
        }}>
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[95%] max-w-[500px] border border-gray-800"
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
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowInviteModal(null)}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group"
                >
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={(e) => {
          e.stopPropagation();
          setShowDeleteModal(null);
        }}>
          <div
            className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[95%] max-w-[450px] border border-gray-800"
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
                <svg className="w-4 h-4 text-gray-400 group-hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm text-red-300 mb-2">
                  <strong>Warning:</strong> This action cannot be undone. This will permanently delete the room and remove all members.
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
    </div>
  );
};

export default Rooms;