import { rtdb } from "@/lib/firebase";
import { ref, set, onDisconnect, onValue, off, get, remove, push, serverTimestamp, update } from "firebase/database";
import type { DataSnapshot } from "firebase/database";

interface SessionData {
  roomId: string;
  isActive: boolean;
  lastSeen: number | object;
  tabVisible: boolean;
  device: string;
  connectedAt: number | object;
}

export interface PresenceSession extends SessionData {
  sessionId: string;
  userId: string;
}

// Heartbeat every 30 seconds
const HEARTBEAT_INTERVAL = 30000;
// Consider offline after 65 seconds (just over 2 heartbeats)
const OFFLINE_THRESHOLD = 65000;
// Grace period before removing presence (10 seconds)
const DISCONNECT_GRACE_PERIOD = 10000;

export class PresenceService {
  private userId: string;
  private roomId: string;
  private sessionId: string;
  private sessionRef: ReturnType<typeof ref>;
  private userPresenceRef: ReturnType<typeof ref>;
  private roomIndexRef: ReturnType<typeof ref>;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private visibilityHandler: (() => void) | null = null;
  private connectionHandler: ((snap: DataSnapshot) => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private disconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private roomIndexDisconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private isInitialized = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastActiveState: boolean | null = null;

  constructor(userId: string, roomId: string) {
    this.userId = userId;
    this.roomId = roomId;
    // Generate a unique session ID
    this.sessionId = push(ref(rtdb, 'sessions')).key!;
    this.sessionRef = ref(rtdb, `Presence/${userId}/sessions/${this.sessionId}`);
    this.userPresenceRef = ref(rtdb, `Presence/${userId}`);
    this.roomIndexRef = ref(rtdb, `RoomIndex/${roomId}/${userId}`);
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      
      // Set up connection state listener FIRST
      this.setupConnectionListener();

      // Create initial session data
      const sessionData: SessionData = {
        roomId: this.roomId,
        isActive: false,
        lastSeen: serverTimestamp(),
        tabVisible: document.visibilityState === 'visible',
        device: this.getDeviceInfo(),
        connectedAt: serverTimestamp()
      };

      // Set up onDisconnect BEFORE setting presence
      this.disconnectRef = onDisconnect(this.sessionRef);
      await this.disconnectRef.remove();
      
      // Set up onDisconnect for room index  
      this.roomIndexDisconnectRef = onDisconnect(this.roomIndexRef);
      await this.roomIndexDisconnectRef.remove();
      
      console.log('[PresenceService] onDisconnect handlers set up for immediate removal');

      // Now set the presence
      await set(this.sessionRef, sessionData);
      
      // Also set initial room index entry (only meaningful data)
      await set(this.roomIndexRef, {
        userId: this.userId,
        isActive: false,
        joinedAt: serverTimestamp()
      });

      // Set up visibility tracking
      this.setupVisibilityTracking();
      
      // Set up beforeunload handler for immediate cleanup
      this.setupBeforeUnloadHandler();

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[PresenceService] Initialization failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    // Stop all listeners and intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      window.removeEventListener('pagehide', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    if (this.connectionHandler) {
      const connectedRef = ref(rtdb, '.info/connected');
      off(connectedRef, 'value', this.connectionHandler);
      this.connectionHandler = null;
    }

    // Cancel onDisconnect handlers first
    if (this.disconnectRef) {
      await this.disconnectRef.cancel();
      this.disconnectRef = null;
    }
    
    if (this.roomIndexDisconnectRef) {
      await this.roomIndexDisconnectRef.cancel();
      this.roomIndexDisconnectRef = null;
    }

    // Remove presence immediately (no grace period needed for explicit cleanup)
    console.log('[PresenceService] Cleanup called - removing presence immediately');
    try {
      await remove(this.sessionRef);
      await remove(this.roomIndexRef);
    } catch (error) {
      // Session might already be removed
      console.log('[PresenceService] Cleanup error (might be already removed):', error);
    }

    this.isInitialized = false;
  }

  async setActive(isActive: boolean): Promise<void> {
    if (!this.isInitialized) return;

    try {
      // Always update the session (for heartbeat/cleanup)
      await update(this.sessionRef, {
        isActive,
        lastSeen: serverTimestamp()
      });
      
      // Only update room index if active state actually changed
      if (this.lastActiveState !== isActive) {
        await update(this.roomIndexRef, {
          isActive,
          lastUpdated: serverTimestamp()
        });
        this.lastActiveState = isActive;
      }
    } catch (error) {
      console.error('[PresenceService] Failed to update active status:', error);
    }
  }

  private setupConnectionListener(): void {
    const connectedRef = ref(rtdb, '.info/connected');
    
    this.connectionHandler = async (snap: DataSnapshot) => {
      if (snap.val() === true) {
        // We're connected (or reconnected)
        
        // Re-establish onDisconnect
        if (this.disconnectRef) {
          await this.disconnectRef.cancel();
        }
        this.disconnectRef = onDisconnect(this.sessionRef);
        await this.disconnectRef.remove();
        
        if (this.roomIndexDisconnectRef) {
          await this.roomIndexDisconnectRef.cancel();
        }
        this.roomIndexDisconnectRef = onDisconnect(this.roomIndexRef);
        await this.roomIndexDisconnectRef.remove();
        
        // Update our presence
        await update(this.sessionRef, {
          lastSeen: serverTimestamp(),
          tabVisible: document.visibilityState === 'visible'
        });
        
        // Restart heartbeat if it was stopped
        if (!this.heartbeatInterval && this.isInitialized) {
          this.startHeartbeat();
        }
      } else {
        // We're disconnected
        
        // Stop heartbeat during disconnect
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      }
    };
    
    onValue(connectedRef, this.connectionHandler);
  }

  private setupVisibilityTracking(): void {
    this.visibilityHandler = () => {
      const isVisible = document.visibilityState === 'visible';
      
      update(this.sessionRef, {
        tabVisible: isVisible,
        lastSeen: serverTimestamp()
      }).catch(() => {
        // Failed to update visibility
      });

      if (isVisible && !this.heartbeatInterval) {
        // Tab became visible, restart heartbeat
        this.startHeartbeat();
      } else if (!isVisible && this.heartbeatInterval) {
        // Tab became hidden, keep heartbeat but maybe reduce frequency
        // For now, we'll keep it running to maintain presence
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private startHeartbeat(): void {
    // Clear any existing interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Update immediately
    this.updateHeartbeat();

    // Then update every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  private async updateHeartbeat(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      await update(this.sessionRef, {
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error('[PresenceService] Heartbeat failed:', error);
    }
  }

  private async removeWithGracePeriod(): Promise<void> {
    // First, mark as disconnecting
    try {
      await update(this.sessionRef, {
        disconnecting: true,
        lastSeen: serverTimestamp()
      });
    } catch {
      // Session might already be gone
    }

    // Wait for grace period
    await new Promise(resolve => setTimeout(resolve, DISCONNECT_GRACE_PERIOD));

    // Now remove
    try {
      await remove(this.sessionRef);
      await remove(this.roomIndexRef);
    } catch {
      // Session might already be removed by onDisconnect
    }
  }

  private setupBeforeUnloadHandler(): void {
    this.beforeUnloadHandler = () => {
      // Synchronously remove presence on window close
      // Can't use async in beforeunload, so we do direct Firebase calls
      if (this.isInitialized) {
        // These are fire-and-forget, best effort during unload
        remove(this.sessionRef);
        remove(this.roomIndexRef);
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    window.addEventListener('pagehide', this.beforeUnloadHandler); // Better for mobile
  }

  private getDeviceInfo(): string {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  // Static helper methods

  static listenToTotalOnlineUsers(callback: (count: number) => void): () => void {
    const presenceRef = ref(rtdb, 'Presence');
    const OFFLINE_THRESHOLD = 65000; // 65 seconds
    
    const handler = (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        callback(0);
        return;
      }

      const now = Date.now();
      const uniqueUsers = new Set<string>();
      const allUsers = snapshot.val();

      // Iterate through all users
      for (const [userId, userData] of Object.entries(allUsers)) {
        const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
        if (!userSessions) continue;

        // Check if user has at least one active session
        for (const sessionData of Object.values(userSessions)) {
          const session = sessionData as SessionData;
          
          // Check if session is still online (within threshold)
          if (typeof session.lastSeen === 'number' &&
              now - session.lastSeen < OFFLINE_THRESHOLD) {
            uniqueUsers.add(userId);
            break; // User is online, no need to check other sessions
          }
        }
      }

      callback(uniqueUsers.size);
    };

    onValue(presenceRef, handler);

    // Return cleanup function
    return () => {
      off(presenceRef, 'value', handler);
    };
  }

  static async getTotalOnlineUsers(): Promise<number> {
    const presenceRef = ref(rtdb, 'Presence');
    const snapshot = await get(presenceRef);
    
    if (!snapshot.exists()) return 0;

    const now = Date.now();
    const uniqueUsers = new Set<string>();
    const allUsers = snapshot.val();

    // Iterate through all users
    for (const [userId, userData] of Object.entries(allUsers)) {
      const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
      if (!userSessions) continue;

      // Check if user has at least one active session
      let hasActiveSession = false;
      for (const sessionData of Object.values(userSessions)) {
        const session = sessionData as SessionData;
        
        // Check if session is still online (within threshold of 65 seconds)
        if (typeof session.lastSeen === 'number' &&
            now - session.lastSeen < OFFLINE_THRESHOLD) {
          hasActiveSession = true;
          break;
        }
      }

      if (hasActiveSession) {
        uniqueUsers.add(userId);
      }
    }

    return uniqueUsers.size;
  }

  static async getRoomSessions(roomId: string): Promise<PresenceSession[]> {
    const presenceRef = ref(rtdb, 'Presence');
    const snapshot = await get(presenceRef);
    
    if (!snapshot.exists()) return [];

    const now = Date.now();
    const sessions: PresenceSession[] = [];
    const allUsers = snapshot.val();

    // Iterate through all users
    for (const [userId, userData] of Object.entries(allUsers)) {
      const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
      if (!userSessions) continue;

      // Iterate through user's sessions
      for (const [sessionId, sessionData] of Object.entries(userSessions)) {
        const session = sessionData as SessionData;
        
        // Filter by room and online status
        if (session.roomId === roomId && 
            typeof session.lastSeen === 'number' &&
            now - session.lastSeen < OFFLINE_THRESHOLD) {
          sessions.push({
            ...session,
            sessionId,
            userId
          });
        }
      }
    }

    return sessions;
  }

  static async getActiveWorkers(roomId: string): Promise<PresenceSession[]> {
    const roomSessions = await this.getRoomSessions(roomId);
    return roomSessions.filter(session => session.isActive);
  }

  static async getUserSessions(userId: string): Promise<PresenceSession[]> {
    const userRef = ref(rtdb, `Presence/${userId}/sessions`);
    const snapshot = await get(userRef);
    
    if (!snapshot.exists()) return [];

    const now = Date.now();
    const sessions: PresenceSession[] = [];
    const userSessions = snapshot.val();

    for (const [sessionId, sessionData] of Object.entries(userSessions)) {
      const session = sessionData as SessionData;
      
      // Only include online sessions
      if (typeof session.lastSeen === 'number' &&
          now - session.lastSeen < OFFLINE_THRESHOLD) {
        sessions.push({
          ...session,
          sessionId,
          userId
        });
      }
    }

    return sessions;
  }

  // Real-time listeners

  static listenToRoomPresence(
    roomId: string, 
    callback: (sessions: PresenceSession[]) => void
  ): () => void {
    // Listen to the RoomIndex for this room (only meaningful changes)
    const roomIndexRef = ref(rtdb, `RoomIndex/${roomId}`);
    
    const handler = (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const roomData = snapshot.val();
      const sessions: PresenceSession[] = [];
      
      // roomData structure: { userId: { isActive, joinedAt, ... } }
      for (const [userId, userData] of Object.entries(roomData)) {
        const user = userData as { isActive?: boolean; lastUpdated?: number | object; joinedAt?: number | object };
        // Create a session-like object for compatibility
        sessions.push({
          userId,
          sessionId: 'room-index', // Placeholder since room index doesn't track sessions
          roomId,
          isActive: user.isActive || false,
          lastSeen: user.lastUpdated || user.joinedAt || Date.now(),
          tabVisible: true, // Not tracked in room index
          device: 'unknown', // Not tracked in room index
          connectedAt: user.joinedAt || Date.now()
        });
      }

      callback(sessions);
    };

    onValue(roomIndexRef, handler);

    // Return cleanup function
    return () => {
      off(roomIndexRef, 'value', handler);
    };
  }
}