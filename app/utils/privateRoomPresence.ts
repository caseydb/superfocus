import { rtdb } from "@/lib/firebase";
import { ref, set, onDisconnect, get, remove } from "firebase/database";

interface UserPresence {
  userId: string;
  lastSeen: number;
  tabCount: number;
}

// How often to update presence (30 seconds)
const HEARTBEAT_INTERVAL = 30000;
// How long before considering a user offline (60 seconds)
const OFFLINE_THRESHOLD = 60000;

export class PrivateRoomPresence {
  private roomId: string;
  private userId: string;
  private intervalId: NodeJS.Timeout | null = null;
  private presenceRef: ReturnType<typeof ref>;
  private unsubscribe: (() => void) | null = null;

  constructor(roomId: string, userId: string) {
    this.roomId = roomId;
    this.userId = userId;
    this.presenceRef = ref(rtdb, `PrivateRoomPresence/${roomId}/${userId}`);
  }

  async join(): Promise<boolean> {
    try {
      
      // Private rooms don't have user limits
      
      // Set initial presence
      await this.updatePresence();

      // Set up onDisconnect to remove presence
      await onDisconnect(this.presenceRef).remove();

      // Start heartbeat
      this.startHeartbeat();

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
    
    // Private rooms are permanent, no cleanup needed
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

  async getActiveUserCount(): Promise<number> {
    const presenceRef = ref(rtdb, `PrivateRoomPresence/${this.roomId}`);
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
}

// Helper function to get current user count for a private room
export async function getPrivateRoomUserCount(roomId: string): Promise<number> {
  const presenceRef = ref(rtdb, `PrivateRoomPresence/${roomId}`);
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