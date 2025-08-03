"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ContactsProps {
  onClose: () => void;
  availabilityStatus?: "available" | "dnd" | "offline";
  setAvailabilityStatus?: (value: "available" | "dnd" | "offline") => void;
  onNotificationCountChange?: (count: number) => void;
  messagesNotificationCount?: number;
  setMessagesNotificationCount?: (count: number) => void;
  requestsNotificationCount?: number;
  setRequestsNotificationCount?: (count: number) => void;
}

type Status = "online" | "offline";
type TabType = "all" | "messages" | "requests" | "invite";

interface Friend {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  status: Status;
  currentRoom?: string;
  currentTask?: string;
  taskDuration?: string;
  lastSeen?: string;
  avatar?: string;
  mutualFriends?: number;
  isPending?: boolean;
  lastMessage?: {
    text: string;
    time: string;
    unread?: boolean;
  };
  isGroup?: boolean;
  team?: string;
}

// Hardcoded friends data with various statuses
const MOCK_FRIENDS: Friend[] = [
  { id: "1", name: "Alex Chen", firstName: "Alex", lastName: "Chen", status: "online", currentRoom: "/focus-flow", currentTask: "Actively working", taskDuration: "45m", avatar: "AC", lastMessage: { text: "Hey, can you review my PR?", time: "2m ago", unread: true }, team: "Vendorsage" },
  { id: "2", name: "Sarah Johnson", firstName: "Sarah", lastName: "Johnson", status: "online", currentRoom: "/deep-work", currentTask: "Do not disturb", taskDuration: "1h 23m", avatar: "SJ", lastMessage: { text: "Thanks for the help earlier!", time: "15m ago" }, team: "Vendorsage" },
  { id: "4", name: "Emma Davis", firstName: "Emma", lastName: "Davis", status: "online", currentRoom: "/study-hall", currentTask: "Actively working", taskDuration: "2h 10m", avatar: "ED" },
  { id: "5", name: "James Wilson", firstName: "James", lastName: "Wilson", status: "offline", lastSeen: "2h ago", avatar: "JW", lastMessage: { text: "Great work on the project! 🎉", time: "3h ago" } },
  { id: "6", name: "Lisa Anderson", firstName: "Lisa", lastName: "Anderson", status: "online", currentRoom: "/focus-flow", currentTask: "Completed task 15m ago", taskDuration: "30m", avatar: "LA", team: "Vendorsage" },
  { id: "7", name: "David Brown", firstName: "David", lastName: "Brown", status: "online", currentRoom: "/grind-time", currentTask: "Do not disturb", lastSeen: "15m ago", avatar: "DB" },
  { id: "8", name: "Jennifer Taylor", firstName: "Jennifer", lastName: "Taylor", status: "online", currentRoom: "/deep-work", currentTask: "Actively working", taskDuration: "1h 45m", avatar: "JT", team: "Vendorsage" },
  { id: "9", name: "Robert Martinez", firstName: "Robert", lastName: "Martinez", status: "offline", lastSeen: "Yesterday", avatar: "RM" },
  { id: "10", name: "Maria Garcia", firstName: "Maria", lastName: "Garcia", status: "online", currentRoom: "/coding-dojo", currentTask: "Do not disturb", taskDuration: "3h 20m", avatar: "MG", team: "Vendorsage" },
  { id: "11", name: "Chris Lee", firstName: "Chris", lastName: "Lee", status: "online", currentRoom: "/study-hall", currentTask: "Completed task 10m ago", lastSeen: "10m ago", avatar: "CL" },
  { id: "12", name: "Amanda White", firstName: "Amanda", lastName: "White", status: "online", currentRoom: "/focus-mode", currentTask: "Actively working", taskDuration: "55m", avatar: "AW", team: "Vendorsage" },
  { id: "13", name: "Kevin Harris", firstName: "Kevin", lastName: "Harris", status: "offline", lastSeen: "3d ago", avatar: "KH" },
  { id: "14", name: "Rachel Green", firstName: "Rachel", lastName: "Green", status: "online", currentRoom: "/productivity-lab", currentTask: "Completed task 5m ago", taskDuration: "40m", avatar: "RG" },
  { id: "15", name: "Tom Scott", firstName: "Tom", lastName: "Scott", status: "online", currentRoom: "/deep-focus", currentTask: "Do not disturb", lastSeen: "25m ago", avatar: "TS" },
  { id: "16", name: "Nicole Adams", firstName: "Nicole", lastName: "Adams", status: "online", currentRoom: "/work-zone", currentTask: "Actively working", taskDuration: "1h 15m", avatar: "NA" },
  { id: "17", name: "Brian King", firstName: "Brian", lastName: "King", status: "offline", lastSeen: "1w ago", avatar: "BK" },
  { id: "18", name: "Jessica Lewis", firstName: "Jessica", lastName: "Lewis", status: "online", currentRoom: "/grind-time", currentTask: "Completed task 30m ago", taskDuration: "2h 30m", avatar: "JL" },
  { id: "19", name: "Daniel Clark", firstName: "Daniel", lastName: "Clark", status: "online", currentRoom: "/study-zone", currentTask: "Do not disturb", lastSeen: "30m ago", avatar: "DC" },
  { id: "20", name: "Ashley Rodriguez", firstName: "Ashley", lastName: "Rodriguez", status: "online", currentRoom: "/focus-flow", currentTask: "Actively working", taskDuration: "1h 5m", avatar: "AR" },
];

// Friend requests (incoming)
const MOCK_REQUESTS: Friend[] = [
  { id: "21", name: "Oliver Thompson", firstName: "Oliver", lastName: "Thompson", status: "online", isPending: true, mutualFriends: 5, avatar: "OT" },
  { id: "22", name: "Sophia Walker", firstName: "Sophia", lastName: "Walker", status: "offline", isPending: true, mutualFriends: 3, avatar: "SW" },
  { id: "23", name: "Ethan Hall", firstName: "Ethan", lastName: "Hall", status: "online", isPending: true, mutualFriends: 8, avatar: "EH" },
];

// Outgoing pending requests
const MOCK_PENDING: Friend[] = [
  { id: "24", name: "Ryan Mitchell", firstName: "Ryan", lastName: "Mitchell", status: "online", isPending: true, mutualFriends: 7, avatar: "RM" },
  { id: "25", name: "Sophie Chen", firstName: "Sophie", lastName: "Chen", status: "online", isPending: true, mutualFriends: 4, avatar: "SC" },
];

// Non-friends (for profile lookups)
const NON_FRIENDS: Friend[] = [
  { id: "3", name: "Mike Williams", firstName: "Mike", lastName: "Williams", status: "online", currentRoom: "/productivity-lab", currentTask: "Completed task 5m ago", lastSeen: "5m ago", avatar: "MW", mutualFriends: 12 },
];

interface Message {
  id: string;
  senderId: string;
  text: string;
  time: string;
  isMe?: boolean;
  reactions?: string[];
}


const MOCK_CONVERSATIONS: Record<string, Message[]> = {
  "1": [
    { id: "m1", senderId: "me", text: "Hey Alex, how's the React component coming along?", time: "10m ago", isMe: true },
    { id: "m2", senderId: "1", text: "Going well! Just finishing up the state management", time: "8m ago" },
    { id: "m3", senderId: "1", text: "Should have the PR ready in about 30 mins", time: "5m ago" },
    { id: "m4", senderId: "1", text: "Hey, can you review my PR?", time: "2m ago" },
  ],
  "2": [
    { id: "m5", senderId: "me", text: "Thanks for your help with the API integration!", time: "20m ago", isMe: true },
    { id: "m6", senderId: "2", text: "No problem! Happy to help anytime 😊", time: "18m ago" },
    { id: "m7", senderId: "2", text: "Thanks for the help earlier!", time: "15m ago" },
  ],
  "4": [
    { id: "m8", senderId: "me", text: "Hi Emma! Quick question about the ML research you're working on", time: "Just now", isMe: true },
  ],
  "group-1": [
    { id: "g1", senderId: "1", text: "Team standup in 5 minutes!", time: "1h ago", reactions: ["👍", "👍"] },
    { id: "g2", senderId: "3", text: "I'll be there", time: "58m ago", reactions: ["✅", "✅"] },
    { id: "g3", senderId: "me", text: "Same here", time: "57m ago", isMe: true },
    { id: "g4", senderId: "2", text: "Great meeting everyone!", time: "30m ago", reactions: ["🎉", "🎉", "👏", "💯"] },
  ],
};

// Common emojis for quick access
const COMMON_EMOJIS = [
  "😀", "😃", "😄", "😁", "😊", "😍", "🥰", "😘", "🤗", "🤩",
  "😎", "🤓", "🧐", "🤔", "😂", "🤣", "😭", "😢", "😅", "😆",
  "👍", "👎", "👌", "✌️", "🤞", "🤟", "👏", "🙌", "💪", "🙏",
  "❤️", "💕", "💖", "💗", "💙", "💚", "💛", "💜", "🖤", "🤍",
  "🔥", "⭐", "✨", "💫", "🌟", "⚡", "🎉", "🎊", "🎈", "🎁",
  "💯", "✅", "❌", "⚠️", "📌", "🚀", "💡", "🎯", "📣", "💬"
];

// Track if beta disclaimer has been shown this session
let hasShownPeopleBetaDisclaimer = false;

const Contacts: React.FC<ContactsProps> = ({ 
  onClose, 
  availabilityStatus: availabilityStatusProp, 
  setAvailabilityStatus: setAvailabilityStatusProp, 
  onNotificationCountChange,
  messagesNotificationCount: messagesNotificationCountProp,
  setMessagesNotificationCount: setMessagesNotificationCountProp,
  requestsNotificationCount: requestsNotificationCountProp,
  setRequestsNotificationCount: setRequestsNotificationCountProp
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriendUsername, setNewFriendUsername] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [showProfileModal, setShowProfileModal] = useState<string | null>(null);
  const [showContactMenu, setShowContactMenu] = useState<string | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState(availabilityStatusProp ?? "available");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>(() => {
    // Initialize with pre-existing reactions from mock data
    const initialReactions: Record<string, string[]> = {};
    Object.values(MOCK_CONVERSATIONS).forEach(messages => {
      messages.forEach(message => {
        if (message.reactions) {
          initialReactions[message.id] = [...message.reactions];
        }
      });
    });
    return initialReactions;
  });
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [reactionPickerCoords, setReactionPickerCoords] = useState<{ top: number; left: number } | null>(null);
  const [userReactions, setUserReactions] = useState<Record<string, string[]>>({});
  const [showBetaDisclaimer, setShowBetaDisclaimer] = useState(!hasShownPeopleBetaDisclaimer);
  const messagesNotificationCount = messagesNotificationCountProp ?? 1;
  const requestsNotificationCount = requestsNotificationCountProp ?? 3;
  const setMessagesNotificationCount = setMessagesNotificationCountProp || (() => {});
  const setRequestsNotificationCount = setRequestsNotificationCountProp || (() => {});
  
  // Update parent component with total notification count
  useEffect(() => {
    const totalCount = messagesNotificationCount + requestsNotificationCount;
    onNotificationCountChange?.(totalCount);
  }, [messagesNotificationCount, requestsNotificationCount, onNotificationCountChange]);
  
  // Update flag when disclaimer is dismissed
  useEffect(() => {
    if (!showBetaDisclaimer && !hasShownPeopleBetaDisclaimer) {
      hasShownPeopleBetaDisclaimer = true;
    }
  }, [showBetaDisclaimer]);
  
  // Click outside handler for contact menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.contact-menu-container')) {
        setShowContactMenu(null);
      }
    };

    if (showContactMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContactMenu]);
  
  // Click outside handler for emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker-container')) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showEmojiPicker]);
  
  // Click outside handler for reaction picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.reaction-picker-container')) {
        setShowReactionPicker(null);
      }
    };

    if (showReactionPicker) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showReactionPicker]);
  
  // Filter friends based on search and tab
  const filteredFriends = useMemo(() => {
    let friends = activeTab === "requests" ? MOCK_REQUESTS : MOCK_FRIENDS;
    
    if (activeTab === "messages") {
      // For messages tab, show recent conversations
      const conversations = MOCK_FRIENDS.filter(f => f.lastMessage);
      // Add group conversation
      const groupConvo: Friend = {
        id: "group-1",
        name: "Team Standup",
        firstName: "Team",
        lastName: "Standup",
        status: "online",
        lastMessage: { text: "Great meeting everyone!", time: "30m ago" },
        avatar: "TS",
        isGroup: true,
        team: "Vendorsage"
      };
      let allConversations = [groupConvo, ...conversations];
      
      // Sort by message recency
      allConversations.sort((a, b) => {
        const getTimeValue = (timeStr: string) => {
          if (timeStr.includes('m ago')) {
            return parseInt(timeStr.replace('m ago', ''));
          }
          if (timeStr.includes('h ago')) {
            return parseInt(timeStr.replace('h ago', '')) * 60;
          }
          if (timeStr.includes('d ago')) {
            return parseInt(timeStr.replace('d ago', '')) * 60 * 24;
          }
          return 999999; // Very old messages
        };
        
        const timeA = getTimeValue(a.lastMessage?.time || '');
        const timeB = getTimeValue(b.lastMessage?.time || '');
        return timeA - timeB; // Lower values (more recent) first
      });
      
      // Filter by search query - search in names and all message content
      if (searchQuery) {
        allConversations = allConversations.filter(f => {
          // Check name
          if (f.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return true;
          }
          
          // Check last message
          if (f.lastMessage?.text.toLowerCase().includes(searchQuery.toLowerCase())) {
            return true;
          }
          
          // Check all messages in conversation history
          const conversationMessages = MOCK_CONVERSATIONS[f.id];
          if (conversationMessages) {
            return conversationMessages.some(msg => 
              msg.text.toLowerCase().includes(searchQuery.toLowerCase())
            );
          }
          
          return false;
        });
      }
      
      return allConversations.slice(0, 10);
    }
    
    if (searchQuery) {
      friends = friends.filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.currentTask?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Sort: green dots first, then yellow dots, then red dots, then offline
    return friends.sort((a, b) => {
      // Helper to get priority based on status and task
      const getPriority = (friend: Friend) => {
        if (friend.status === "offline") return 4;
        if (friend.currentTask?.includes("Do not disturb")) return 3;
        if (friend.currentTask?.includes("Completed task")) return 2;
        if (friend.currentTask?.includes("Actively working")) return 1;
        return 1; // Default for other online statuses
      };
      
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      
      // If both are "Completed task", sort by time (extract minutes)
      if (priorityA === 2 && priorityB === 2) {
        const getMinutes = (task: string) => {
          const match = task.match(/(\d+)m/);
          return match ? parseInt(match[1]) : 999;
        };
        return getMinutes(a.currentTask || "") - getMinutes(b.currentTask || "");
      }
      
      return priorityA - priorityB;
    });
  }, [activeTab, searchQuery]);

  // Get pending requests separately
  const filteredPending = useMemo(() => {
    if (activeTab !== "requests") return [];
    
    let pending = MOCK_PENDING;
    if (searchQuery) {
      pending = pending.filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return pending.sort((a, b) => {
      // Sort online first, then offline for pending requests
      const statusOrder = { online: 0, offline: 1 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [activeTab, searchQuery]);


  const handleQuickSwitch = (roomUrl: string) => {
    onClose();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(roomUrl as any);
  };

  const getStatusColor = (status: Status, taskDescription?: string) => {
    if (status === "offline") return "bg-gray-500";
    if (status === "online" && taskDescription) {
      if (taskDescription.includes("Do not disturb")) return "bg-red-500";
      if (taskDescription.includes("Completed task")) return "bg-yellow-500";
      if (taskDescription.includes("Actively working")) return "bg-green-500";
    }
    return "bg-green-500"; // Default for online
  };

  const getStatusText = (friend: Friend) => {
    if (friend.status === "online" && friend.currentTask) {
      // Replace "Completed task X ago" with "Standby"
      if (friend.currentTask.includes("Completed task")) {
        return "Standby";
      }
      return friend.currentTask;
    }
    if (friend.status === "offline") {
      // Generate a random time for last seen if not provided
      const lastSeenTimes = ["5m ago", "30m ago", "1h ago", "2h ago", "5h ago", "1d ago"];
      const randomTime = lastSeenTimes[Math.floor(Math.random() * lastSeenTimes.length)];
      const lastSeenText = friend.lastSeen || randomTime;
      // Handle special cases like "Yesterday" that don't need "ago"
      if (lastSeenText.toLowerCase() === "yesterday") {
        return "Last seen yesterday";
      }
      return `Last seen ${lastSeenText}`;
    }
    return "Available";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95" onClick={onClose}>
      {/* Beta Disclaimer Popup */}
      {showBetaDisclaimer && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShowBetaDisclaimer(false)}
        >
          <div 
            className="bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-md mx-4 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-[#FFAA00]/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-200">Beta Preview</h3>
              <p className="text-gray-400 leading-relaxed">
                This is a prototype demonstration with simulated data for user experience testing and feedback collection.
              </p>
              <p className="text-sm text-gray-500">
                Real-time functionality coming soon.
              </p>
              <button
                onClick={() => setShowBetaDisclaimer(false)}
                className="px-6 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
              >
                Got it, let&apos;s explore!
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[800px] h-[85vh] flex flex-col border border-gray-800 relative ${
          showBetaDisclaimer ? 'opacity-40 pointer-events-none' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4">
          {/* Availability Status - positioned absolutely on left */}
          <button
            onClick={() => {
              // Cycle through states: available -> dnd -> offline -> available
              const nextStatus = 
                availabilityStatus === "available" ? "dnd" :
                availabilityStatus === "dnd" ? "offline" : "available";
              setAvailabilityStatus(nextStatus);
              setAvailabilityStatusProp?.(nextStatus);
            }}
            className="absolute left-0 flex items-center gap-1.5 group"
          >
            <div className={`w-2 h-2 rounded-full ${
              availabilityStatus === "offline" ? 'bg-gray-500' :
              availabilityStatus === "dnd" ? 'bg-red-500' : 
              'bg-green-500'
            }`} />
            <span className={`text-sm ${
              availabilityStatus === "offline" ? 'text-gray-400' :
              availabilityStatus === "dnd" ? 'text-red-400' : 
              'text-green-400'
            } group-hover:opacity-80 transition-opacity`}>
              {availabilityStatus === "offline" ? 'Appear offline' :
               availabilityStatus === "dnd" ? 'Do Not Disturb' : 
               'Online'}
            </span>
          </button>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">People</h2>
          
          {/* Close button - positioned absolutely */}
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
            onClick={() => {
              setActiveTab("all");
              setShowNewMessage(false);
            }}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === "all"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            All Contacts
          </button>
          <button
            onClick={() => {
              setActiveTab("messages");
              setShowAddFriend(false);
              setMessagesNotificationCount(0);
              setMessagesNotificationCountProp?.(0);
            }}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === "messages"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Messages
            {messagesNotificationCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === "messages" 
                  ? "bg-black/20 text-black" 
                  : "bg-red-500 text-white animate-pulse"
              }`}>
                {messagesNotificationCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("requests");
              setShowAddFriend(false);
              setShowNewMessage(false);
              setRequestsNotificationCount(0);
              setRequestsNotificationCountProp?.(0);
            }}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === "requests"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Requests
            {requestsNotificationCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === "requests" 
                  ? "bg-black/20 text-black" 
                  : "bg-red-500 text-white animate-pulse"
              }`}>
                {requestsNotificationCount}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("invite");
              setShowAddFriend(false);
              setShowNewMessage(false);
            }}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              activeTab === "invite"
                ? "bg-[#FFAA00] text-black"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Invite
          </button>
        </div>

        {/* Search and Add Friend */}
        {activeTab !== "requests" && activeTab !== "invite" && (
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
                placeholder={activeTab === "messages" ? "Search messages..." : "Search contacts..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
              />
            </div>
            {activeTab === "messages" ? (
              <button
                onClick={() => setShowNewMessage(true)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-[#FFAA00] hover:text-[#FFAA00] transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Message
              </button>
            ) : (
              <button
                onClick={() => setShowAddFriend(!showAddFriend)}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-[#FFAA00] hover:text-[#FFAA00] transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Add Contact
              </button>
            )}
          </div>
        )}

        {/* Add Friend Input */}
        {showAddFriend && (
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter username or email..."
                value={newFriendUsername}
                onChange={(e) => setNewFriendUsername(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
              />
              <button
                className="px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors"
                onClick={() => {
                  // Handle send request
                  setNewFriendUsername("");
                  setShowAddFriend(false);
                }}
              >
                Send Request
              </button>
              <button
                className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                onClick={() => {
                  setShowAddFriend(false);
                  setNewFriendUsername("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* New Message Modal */}
        {showNewMessage && (
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">To:</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedRecipients.map(id => {
                    const friend = MOCK_FRIENDS.find(f => f.id === id);
                    return (
                      <span key={id} className="px-2 py-1 bg-gray-700 rounded-full text-sm text-gray-300 flex items-center gap-1">
                        {friend?.name}
                        <button
                          onClick={() => setSelectedRecipients(prev => prev.filter(r => r !== id))}
                          className="hover:text-red-400"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
                />
                {recipientSearch && (
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {MOCK_FRIENDS
                      .filter(f => 
                        f.name.toLowerCase().includes(recipientSearch.toLowerCase()) &&
                        !selectedRecipients.includes(f.id)
                      )
                      .slice(0, 5)
                      .map(friend => (
                        <button
                          key={friend.id}
                          onClick={() => {
                            setSelectedRecipients(prev => [...prev, friend.id]);
                            setRecipientSearch("");
                          }}
                          className="w-full text-left px-2 py-1 hover:bg-gray-800 rounded flex items-center gap-2"
                        >
                          <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-xs">
                            {friend.avatar}
                          </div>
                          <span className="text-sm text-gray-300">{friend.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {/* Group Name Field - Only show when multiple recipients */}
              {selectedRecipients.length > 1 && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Group Name (optional):</label>
                  <input
                    type="text"
                    placeholder="e.g., Team Standup, Project Alpha..."
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 font-medium rounded-lg transition-colors bg-[#FFAA00] text-black hover:bg-[#FFB700]"
                  onClick={() => {
                    // Handle start conversation - fake example if no recipients selected
                    if (selectedRecipients.length === 0) {
                      // Simulate selecting Emma Davis
                      setSelectedConversation("4");
                    } else {
                      const conversationId = selectedRecipients.length === 1 
                        ? selectedRecipients[0] 
                        : `group-${Date.now()}`;
                      setSelectedConversation(conversationId);
                    }
                    setShowNewMessage(false);
                    setSelectedRecipients([]);
                    setRecipientSearch("");
                    setGroupName("");
                  }}
                >
                  Start Conversation
                </button>
                <button
                  className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  onClick={() => {
                    setShowNewMessage(false);
                    setSelectedRecipients([]);
                    setRecipientSearch("");
                    setGroupName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Friends List / Conversation View */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {selectedConversation && activeTab === "messages" ? (
            // Conversation View
            <div className="flex flex-col h-full">
              {/* Conversation Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-3 flex-1">
                  {(() => {
                    const isGroup = selectedConversation.startsWith('group-');
                    if (isGroup) {
                      const groupFriend = filteredFriends.find(f => f.id === selectedConversation);
                      // For group chats, show overlapping avatars
                      const groupMembers = [
                        { id: "1", avatar: "AC", status: "online" as Status, currentTask: "Actively working" },
                        { id: "2", avatar: "SJ", status: "online" as Status, currentTask: "Do not disturb" },
                        { id: "3", avatar: "MW", status: "online" as Status, currentTask: "Completed task 5m ago" }
                      ];
                      return (
                        <>
                          <div className="flex -space-x-2">
                            {groupMembers.slice(0, 3).map((member, index) => (
                              <button
                                key={member.id}
                                onClick={() => setShowProfileModal(member.id)}
                                className="relative hover:z-10 transition-all"
                                style={{ zIndex: 3 - index }}
                              >
                                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-300 border-2 border-gray-900 hover:ring-2 hover:ring-[#FFAA00] transition-all">
                                  {member.avatar}
                                </div>
                                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${getStatusColor(member.status, member.currentTask)}`} />
                              </button>
                            ))}
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-200">{groupFriend?.name || 'Group Chat'}</h3>
                            <p className="text-xs text-gray-500">
                              <button onClick={() => setShowProfileModal("1")} className="hover:text-[#FFAA00] transition-colors">Alex Chen</button>,{' '}
                              <button onClick={() => setShowProfileModal("2")} className="hover:text-[#FFAA00] transition-colors">Sarah Johnson</button>,{' '}
                              <button onClick={() => setShowProfileModal("3")} className="hover:text-[#FFAA00] transition-colors">Mike Williams</button>
                            </p>
                          </div>
                        </>
                      );
                    }
                    const friend = MOCK_FRIENDS.find(f => f.id === selectedConversation);
                    return (
                      <>
                        <button
                          onClick={() => friend && setShowProfileModal(friend.id)}
                          className="relative hover:opacity-80 transition-opacity"
                        >
                          <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300 hover:ring-2 hover:ring-[#FFAA00] transition-all">
                            {friend?.avatar}
                          </div>
                          {friend && <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${getStatusColor(friend.status, friend.currentTask)}`} />}
                        </button>
                        <div>
                          <button
                            onClick={() => friend && setShowProfileModal(friend.id)}
                            className="text-left"
                          >
                            <h3 className="font-medium text-gray-200 hover:text-[#FFAA00] transition-colors">{friend?.name}</h3>
                          </button>
                          <p className="text-xs text-gray-500">
                            {friend?.status === 'online' ? 'Active now' : friend?.lastSeen || 'Offline'}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {MOCK_CONVERSATIONS[selectedConversation]?.map((message) => {
                  const sender = message.isMe ? null : [...MOCK_FRIENDS, ...NON_FRIENDS].find(f => f.id === message.senderId);
                  const reactions = messageReactions[message.id] || [];
                  return (
                    <div
                      key={message.id}
                      className={`flex ${message.isMe ? 'justify-end' : 'justify-start'} group`}
                      onMouseEnter={() => setHoveredMessageId(message.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
                    >
                      <div className={`flex items-start gap-2 max-w-[70%] ${message.isMe ? 'flex-row-reverse' : ''} relative`}>
                        {!message.isMe && (
                          <button
                            onClick={() => setShowProfileModal(message.senderId)}
                            className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-300 flex-shrink-0 hover:ring-2 hover:ring-[#FFAA00] transition-all"
                          >
                            {sender?.avatar || 'U'}
                          </button>
                        )}
                        <div className="reaction-picker-container">
                          {!message.isMe && (
                            <div className="flex items-center gap-2 mb-1">
                              <button
                                onClick={() => setShowProfileModal(message.senderId)}
                                className="text-xs text-gray-500 hover:text-[#FFAA00] transition-colors"
                              >
                                {sender?.name || 'Unknown'}
                              </button>
                              <span className="text-xs text-gray-600">{message.time}</span>
                            </div>
                          )}
                          {message.isMe && (
                            <div className="flex items-center gap-2 mb-1 justify-end">
                              <span className="text-xs text-gray-600">{message.time}</span>
                            </div>
                          )}
                          <div className="relative">
                            <div
                              className={`px-3 py-2 rounded-lg ${
                                message.isMe
                                  ? 'bg-[#FFAA00] text-black'
                                  : 'bg-gray-800 text-gray-200'
                              }`}
                            >
                              <p className="text-sm">{message.text}</p>
                            </div>
                            
                            {/* Reactions */}
                            {reactions.length > 0 && (
                              <div className={`flex gap-1 mt-1 ${message.isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className="flex gap-0.5 bg-gray-800/50 rounded-full px-1.5 py-0.5">
                                  {reactions.slice(0, 7).map((emoji, index) => {
                                    const userAddedEmojis = userReactions[message.id] || [];
                                    const isUserEmoji = userAddedEmojis.includes(emoji);
                                    const emojiCount = reactions.filter(e => e === emoji).length;
                                    
                                    // Group same emojis together
                                    if (index > 0 && reactions.slice(0, index).includes(emoji)) {
                                      return null;
                                    }
                                    
                                    return (
                                      <button
                                        key={`${emoji}-${index}`}
                                        onClick={() => {
                                          if (isUserEmoji) {
                                            // Remove user's emoji
                                            const newUserEmojis = userAddedEmojis.filter(e => e !== emoji);
                                            setUserReactions(prev => ({
                                              ...prev,
                                              [message.id]: newUserEmojis
                                            }));
                                            
                                            // Remove one instance from reactions
                                            const newReactions = [...reactions];
                                            const indexToRemove = newReactions.indexOf(emoji);
                                            if (indexToRemove > -1) {
                                              newReactions.splice(indexToRemove, 1);
                                            }
                                            setMessageReactions(prev => ({
                                              ...prev,
                                              [message.id]: newReactions
                                            }));
                                          }
                                        }}
                                        className={`text-sm hover:bg-gray-700/50 px-1 rounded-full transition-colors ${
                                          isUserEmoji ? 'ring-1 ring-[#FFAA00]/50' : ''
                                        }`}
                                        disabled={!isUserEmoji}
                                      >
                                        {emoji}{emojiCount > 1 && <span className="ml-0.5 text-xs text-gray-400">{emojiCount}</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            {/* Add Reaction Button */}
                            {hoveredMessageId === message.id && (
                              <button
                                onClick={(e) => {
                                  const button = e.currentTarget;
                                  const rect = button.getBoundingClientRect();
                                  const messageRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                                  
                                  // Calculate position for emoji picker
                                  const pickerHeight = 280;
                                  const pickerWidth = 344; // 320px + padding
                                  
                                  let top = rect.top - pickerHeight - 8;
                                  let left = messageRect ? (message.isMe ? messageRect.right - pickerWidth : messageRect.left) : rect.left;
                                  
                                  // If picker would go above viewport, position below
                                  if (top < 10) {
                                    top = rect.bottom + 8;
                                  }
                                  
                                  // Keep within horizontal bounds
                                  if (left < 10) left = 10;
                                  if (left + pickerWidth > window.innerWidth - 10) {
                                    left = window.innerWidth - pickerWidth - 10;
                                  }
                                  
                                  setReactionPickerCoords({ top, left });
                                  setShowReactionPicker(message.id);
                                }}
                                className={`absolute ${message.isMe ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 ${message.isMe ? '-translate-x-full -ml-2' : 'translate-x-full ml-2'} opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center`}
                              >
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            )}
                            
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-800 p-4">
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1 emoji-picker-container">
                      <input
                        type="text"
                        placeholder="Type a message..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && messageText.trim()) {
                            e.preventDefault();
                            // Handle send message
                            setMessageText('');
                          }
                        }}
                        className="w-full pl-3 pr-10 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
                      />
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#FFAA00] transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      
                      {/* Emoji Picker Dropdown */}
                      {showEmojiPicker && (
                        <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-3 z-50">
                          <div className="grid grid-cols-10 gap-1 max-w-[300px]">
                            {COMMON_EMOJIS.map((emoji, index) => (
                              <button
                                key={index}
                                onClick={() => {
                                  setMessageText(prev => prev + emoji);
                                  setShowEmojiPicker(false);
                                }}
                                className="w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded transition-colors text-lg"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (messageText.trim()) {
                          // Handle send message
                          setMessageText('');
                        }
                      }}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        messageText.trim()
                          ? 'bg-[#FFAA00] text-black hover:bg-[#FFB700]'
                          : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!messageText.trim()}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : filteredFriends.length === 0 && filteredPending.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <p className="text-lg font-medium">No contacts found</p>
              <p className="text-sm text-gray-600">Try searching with different keywords</p>
            </div>
          ) : activeTab === "invite" ? (
            // Invite People Tab
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-4">
                <div className="w-full max-w-md space-y-4">
                  {/* Referral Bonus Banner */}
                  <div className="bg-gradient-to-r from-[#FFAA00]/10 to-[#FFAA00]/5 border border-[#FFAA00]/20 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#FFAA00]/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[#FFAA00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#FFAA00]">Share the love, get rewarded!</p>
                        <p className="text-xs text-gray-400">You and your friend both get 1 month premium when they join</p>
                      </div>
                    </div>
                  </div>


                  {/* Email Invitation */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-400">Invite by email</label>
                    <div className="space-y-2">
                      <input
                        type="email"
                        placeholder="Enter email addresses (comma separated)"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-[#FFAA00] transition-colors"
                      />
                      <button 
                        className="w-full px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Send Invitations
                      </button>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-gray-900 text-gray-500">or share your link</span>
                    </div>
                  </div>

                  {/* Share Link */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Personal invite link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/your-referral-code`}
                        readOnly
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/invite/your-referral-code`);
                        }}
                        className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTab === "requests" && (
                <>
                  {/* Incoming Requests Section */}
                  {filteredFriends.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2 px-1">Incoming Requests</h3>
                      <div className="space-y-2">
              {filteredFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Avatar with status indicator */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowProfileModal(friend.id);
                        }}
                        className="relative hover:opacity-80 transition-opacity"
                      >
                        <div className={`w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300 ${!friend.isGroup ? 'hover:ring-2 hover:ring-[#FFAA00]' : ''} transition-all`}>
                          {friend.isGroup ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            friend.avatar
                          )}
                        </div>
                        {!friend.isGroup && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(friend.status, friend.currentTask)}`} />}
                      </button>
                      
                      {/* Friend info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-200">{friend.name}</h3>
                          {friend.team && (
                            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                              {friend.team}
                            </span>
                          )}
                          {friend.isPending && (
                            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded-full">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {friend.isPending && friend.mutualFriends
                            ? `${friend.mutualFriends} mutual friends`
                            : getStatusText(friend)
                          }
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {friend.isPending && (
                        <>
                          <button className="px-3 py-1.5 bg-[#FFAA00] text-black text-sm font-medium rounded-lg hover:bg-[#FFB700] transition-colors">
                            Accept
                          </button>
                          <button className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">
                            Ignore
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Pending Requests Section */}
                  {filteredPending.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-400 mb-2 px-1">Pending</h3>
                      <div className="space-y-2">
                        {filteredPending.map((friend) => (
                          <div
                            key={friend.id}
                            className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200 group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {/* Avatar with status indicator */}
                                <div className="relative">
                                  <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300">
                                    {friend.avatar}
                                  </div>
                                  {!friend.isGroup && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(friend.status, friend.currentTask)}`} />}
                                </div>
                                
                                {/* Friend info */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-200">{friend.name}</h3>
                                    <span className="text-xs px-2 py-0.5 bg-gray-600/50 text-gray-400 rounded-full">
                                      Waiting for response
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-500">
                                    {friend.mutualFriends} mutual contacts
                                  </p>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-2">
                                <button className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">
                                  Cancel Request
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* Regular friends list for other tabs */}
              {activeTab !== "requests" && (
                <div className="space-y-2">
                  {filteredFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className={`p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200 group ${
                        activeTab === "messages" ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (activeTab === "messages") {
                          setSelectedConversation(friend.id);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Avatar with status indicator */}
                          <button
                            onClick={(e) => {
                              if (!friend.isGroup && (activeTab === "all" || activeTab === "messages")) {
                                // For individuals, open profile and stop propagation
                                e.stopPropagation();
                                setShowProfileModal(friend.id);
                              }
                              // For groups, don't stop propagation - let parent handle it
                            }}
                            className="relative hover:opacity-80 transition-opacity"
                          >
                            <div className={`w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-300 ${!friend.isGroup ? 'hover:ring-2 hover:ring-[#FFAA00]' : ''} transition-all`}>
                              {friend.isGroup ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              ) : (
                                friend.avatar
                              )}
                            </div>
                            {!friend.isGroup && <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getStatusColor(friend.status, friend.currentTask)}`} />}
                          </button>
                          
                          {/* Friend info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-200">{friend.name}</h3>
                              {friend.team && (
                                <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                                  {friend.team}
                                </span>
                              )}
                              {friend.isPending && (
                                <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded-full">
                                  Pending
                                </span>
                              )}
                            </div>
                            {activeTab === "messages" && friend.lastMessage ? (
                              <>
                                <p className={`text-sm line-clamp-1 ${friend.lastMessage.unread ? 'text-white font-semibold' : 'text-gray-500'}`}>
                                  {friend.lastMessage.text}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-gray-600">{friend.lastMessage.time}</span>
                                  {friend.lastMessage.unread && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-gray-500">
                                {friend.isPending && friend.mutualFriends
                                  ? `${friend.mutualFriends} mutual contacts`
                                  : getStatusText(friend)
                                }
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {friend.isPending ? (
                            <>
                              <button className="px-3 py-1.5 bg-[#FFAA00] text-black text-sm font-medium rounded-lg hover:bg-[#FFB700] transition-colors">
                                Accept
                              </button>
                              <button className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">
                                Ignore
                              </button>
                            </>
                          ) : activeTab !== "messages" ? (
                            <>
                              {activeTab === "all" && (
                                <button
                                  onClick={() => {
                                    setActiveTab("messages");
                                    setSelectedConversation(friend.id);
                                  }}
                                  className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200 flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                  </svg>
                                  Message
                                </button>
                              )}
                              {friend.status === "online" && friend.currentRoom && (
                                <button
                                  onClick={() => handleQuickSwitch(friend.currentRoom!)}
                                  className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200 flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                  Join Room
                                </button>
                              )}
                              <div className="relative contact-menu-container">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowContactMenu(showContactMenu === friend.id ? null : friend.id);
                                  }}
                                  className="p-2 text-gray-500 hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                  </svg>
                                </button>
                                
                                {showContactMenu === friend.id && (
                                  <div className="absolute right-0 mt-1 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 z-50">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // TODO: Remove contact logic
                                        setShowContactMenu(null);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors flex items-center gap-2"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Remove Contact
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add scrollbar styling */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1f2937;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #ffaa00;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #ff9500;
        }
      `}</style>

      {/* Profile Modal */}
      {showProfileModal && (() => {
        const profileUser = [...MOCK_FRIENDS, ...MOCK_REQUESTS, ...NON_FRIENDS].find(f => f.id === showProfileModal);
        if (!profileUser) return null;
        
        const isAlreadyFriend = MOCK_FRIENDS.some(f => f.id === showProfileModal);
        const isPendingRequest = MOCK_REQUESTS.some(f => f.id === showProfileModal);
        
        return (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0b0b]/50" 
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileModal(null);
            }}
          >
            <div
              className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-[90%] max-w-[400px] border border-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setShowProfileModal(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
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

              {/* Profile Content */}
              <div className="flex flex-col items-center">
                {/* Large Avatar */}
                <div className="relative mb-4">
                  <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-2xl font-medium text-gray-300">
                    {profileUser.avatar}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-gray-900 ${getStatusColor(profileUser.status, profileUser.currentTask)}`} />
                </div>

                {/* Name */}
                <h3 className="text-xl font-semibold text-gray-200 mb-1">{profileUser.name}</h3>
                
                {/* Status */}
                <p className="text-sm text-gray-500 mb-4">
                  {getStatusText(profileUser)}
                </p>

                {/* Current Room */}
                {profileUser.status === 'online' && profileUser.currentRoom && (
                  <div className="w-full mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">Currently in</p>
                    <p className="text-sm text-gray-300">{profileUser.currentRoom}</p>
                  </div>
                )}

                {/* Mutual Friends */}
                {profileUser.mutualFriends && (
                  <p className="text-sm text-gray-500 mb-4">
                    {profileUser.mutualFriends} mutual contacts
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 w-full">
                  {isPendingRequest ? (
                    <>
                      <button className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors">
                        Accept Request
                      </button>
                      <button className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 font-medium rounded-lg hover:bg-gray-600 transition-colors">
                        Ignore
                      </button>
                    </>
                  ) : isAlreadyFriend ? (
                    <>
                      {profileUser.status === 'online' && profileUser.currentRoom && (
                        <button
                          onClick={() => {
                            handleQuickSwitch(profileUser.currentRoom!);
                            setShowProfileModal(null);
                          }}
                          className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Join Room
                        </button>
                      )}
                      <button
                        onClick={() => {
                          // Start conversation
                          setSelectedConversation(profileUser.id);
                          setShowProfileModal(null);
                        }}
                        className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 font-medium rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        Message
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        // Add friend logic
                        setShowProfileModal(null);
                      }}
                      className="flex-1 px-4 py-2 bg-[#FFAA00] text-black font-medium rounded-lg hover:bg-[#FFB700] transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Add Contact
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Reaction Picker Portal */}
      {showReactionPicker && reactionPickerCoords && (
        <div 
          className="fixed bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-3 z-[200] reaction-picker-container"
          style={{
            top: `${reactionPickerCoords.top}px`,
            left: `${reactionPickerCoords.left}px`,
            maxHeight: '280px',
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-10 gap-0.5 w-[320px]">
            {COMMON_EMOJIS.map((emoji, index) => {
              const currentReactions = messageReactions[showReactionPicker] || [];
              return (
                <button
                  key={index}
                  onClick={() => {
                    if (currentReactions.length < 7) {
                      // Add to message reactions
                      setMessageReactions(prev => ({
                        ...prev,
                        [showReactionPicker]: [...currentReactions, emoji]
                      }));
                      
                      // Track that the user added this emoji
                      const currentUserEmojis = userReactions[showReactionPicker] || [];
                      setUserReactions(prev => ({
                        ...prev,
                        [showReactionPicker]: [...currentUserEmojis, emoji]
                      }));
                    }
                    setShowReactionPicker(null);
                    setReactionPickerCoords(null);
                  }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-gray-700 rounded transition-colors text-sm"
                  disabled={currentReactions.length >= 7}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;