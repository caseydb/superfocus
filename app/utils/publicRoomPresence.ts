import { rtdb } from "@/lib/firebase";
import { ref, set, onDisconnect, onValue, off, get, remove } from "firebase/database";
import type { DataSnapshot } from "firebase/database";
import { deletePublicRoom } from "./publicRooms";

interface UserPresence {
  userId: string;
  lastSeen: number;
  tabCount: number;
}

// How often to update presence (30 seconds)
const HEARTBEAT_INTERVAL = 30000;
// How long before considering a user offline (60 seconds)
const OFFLINE_THRESHOLD = 60000;
// How long before considering a room stale (5 minutes)
const STALE_ROOM_THRESHOLD = 300000;

export class PublicRoomPresence {
  private roomId: string;
  private userId: string;
  private intervalId: NodeJS.Timeout | null = null;
  private presenceRef: ReturnType<typeof ref>;
  private unsubscribe: (() => void) | null = null;

  constructor(roomId: string, userId: string) {
    this.roomId = roomId;
    this.userId = userId;
    this.presenceRef = ref(rtdb, `PublicRoomPresence/${roomId}/${userId}`);
  }

  async join(): Promise<boolean> {
    try {
      // Check if room is full
      const activeCount = await this.getActiveUserCount();
      
      if (activeCount >= 5) {
        return false; // Room is full
      }

      // Set initial presence
      await this.updatePresence();

      // Set up onDisconnect to remove presence
      await onDisconnect(this.presenceRef).remove();

      // Start heartbeat
      this.startHeartbeat();

      // Listen for room changes to detect when to clean up
      this.startCleanupListener();

      return true;
    } catch (error) {
      return false;
    }
  }

  async leave(): Promise<void> {
    
    // Stop heartbeat
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Stop listener
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Remove our presence
    await remove(this.presenceRef);
    
    // The Cloud Function will handle room deletion when users node is empty
  }

  private async updatePresence(): Promise<void> {
    const tabCountRef = ref(rtdb, `tabCounts/${this.userId}`);
    const snapshot = await get(tabCountRef);
    const tabCount = snapshot.val()?.count || 1;

    const now = Date.now();
    
    await set(this.presenceRef, {
      userId: this.userId,
      lastSeen: now,
      tabCount: tabCount
    });
  }

  private startHeartbeat(): void {
    // Update immediately
    this.updatePresence();

    // Then update every 30 seconds
    this.intervalId = setInterval(() => {
      this.updatePresence();
    }, HEARTBEAT_INTERVAL);
  }

  private async getActiveUserCount(): Promise<number> {
    const presenceRef = ref(rtdb, `PublicRoomPresence/${this.roomId}`);
    const snapshot = await get(presenceRef);
    
    if (!snapshot.exists()) return 0;

    const now = Date.now();
    let activeCount = 0;
    const users = snapshot.val();

    for (const [, data] of Object.entries(users)) {
      const presence = data as UserPresence;
      if (now - presence.lastSeen < OFFLINE_THRESHOLD) {
        activeCount++;
      }
    }

    return activeCount;
  }

  private startCleanupListener(): void {
    const roomPresenceRef = ref(rtdb, `PublicRoomPresence/${this.roomId}`);
    
    const handleValue = async (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        // Room presence is gone, we should leave
        this.leave();
        return;
      }
      
      // Check if all users are stale (no active users)
      const users = snapshot.val();
      const now = Date.now();
      let hasActiveUser = false;
      
      for (const [, data] of Object.entries(users)) {
        const presence = data as UserPresence;
        if (now - presence.lastSeen < OFFLINE_THRESHOLD) {
          hasActiveUser = true;
          break;
        }
      }
      
      // If no active users, clean up the room
      if (!hasActiveUser) {
        await deletePublicRoom(this.roomId);
        await remove(roomPresenceRef);
      }
    };

    onValue(roomPresenceRef, handleValue);
    
    this.unsubscribe = () => {
      off(roomPresenceRef, "value", handleValue);
    };
  }

  private async checkRoomCleanup(): Promise<void> {
    const activeCount = await this.getActiveUserCount();
    
    if (activeCount === 0) {
      // No active users, delete the room
      await deletePublicRoom(this.roomId);
      
      // Also clean up presence data
      const roomPresenceRef = ref(rtdb, `PublicRoomPresence/${this.roomId}`);
      await remove(roomPresenceRef);
    }
  }

  // Static method to clean up stale rooms (can be called periodically)
  static async cleanupStaleRooms(): Promise<void> {
    const presenceRootRef = ref(rtdb, "PublicRoomPresence");
    const snapshot = await get(presenceRootRef);
    
    if (!snapshot.exists()) return;

    const now = Date.now();
    const rooms = snapshot.val();

    for (const [roomId, users] of Object.entries(rooms)) {
      let hasActiveUser = false;
      let latestActivity = 0;

      for (const [, data] of Object.entries(users as Record<string, UserPresence>)) {
        const presence = data;
        if (now - presence.lastSeen < OFFLINE_THRESHOLD) {
          hasActiveUser = true;
          break;
        }
        latestActivity = Math.max(latestActivity, presence.lastSeen);
      }

      // If no active users and room has been idle for 5+ minutes, clean it up
      if (!hasActiveUser && now - latestActivity > STALE_ROOM_THRESHOLD) {
        await deletePublicRoom(roomId);
        
        const roomPresenceRef = ref(rtdb, `PublicRoomPresence/${roomId}`);
        await remove(roomPresenceRef);
      }
    }
  }
}

// Helper function to get current user count for a room
export async function getPublicRoomUserCount(roomId: string): Promise<number> {
  const presenceRef = ref(rtdb, `PublicRoomPresence/${roomId}`);
  const snapshot = await get(presenceRef);
  
  if (!snapshot.exists()) return 0;

  const now = Date.now();
  let activeCount = 0;
  const users = snapshot.val();

  for (const [, data] of Object.entries(users)) {
    const presence = data as UserPresence;
    if (now - presence.lastSeen < OFFLINE_THRESHOLD) {
      activeCount++;
    }
  }

  return activeCount;
}