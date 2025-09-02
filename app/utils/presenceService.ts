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
  currentTaskId?: string | null;
  currentTaskName?: string | null;
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
  private sessionMonitorHandler: ((snap: DataSnapshot) => void) | null = null;
  private disconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private roomIndexDisconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private isInitialized = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastActiveState: boolean | null = null;

  constructor(userId: string, roomId: string) {
    if (!userId || !roomId) {
      console.error('[PresenceService] Invalid constructor params:', { userId, roomId });
    }
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
      
      // Set up self-healing listener for this session
      this.setupSessionMonitor();

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
    
    if (this.sessionMonitorHandler) {
      off(this.sessionRef, 'value', this.sessionMonitorHandler);
      this.sessionMonitorHandler = null;
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
    try {
      await remove(this.sessionRef);
      await remove(this.roomIndexRef);
    } catch {
      // Session might already be removed
    }

    this.isInitialized = false;
  }

  async updateCurrentTask(taskId: string | null, taskName: string | null): Promise<void> {
    if (!this.isInitialized || !this.sessionRef) return;
    
    try {
      await update(this.sessionRef, {
        currentTaskId: taskId,
        currentTaskName: taskName,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error('[PresenceService] Failed to update current task:', error);
    }
  }

  async setActive(isActive: boolean): Promise<void> {
    if (!this.isInitialized) return;

    try {
      // If becoming active, ALWAYS deactivate all other sessions regardless of current state
      if (isActive) {
        const updates: Record<string, boolean | object | string | null> = {};
        
        // Get all sessions for this user
        const allSessionsRef = ref(rtdb, `Presence/${this.userId}/sessions`);
        const snapshot = await get(allSessionsRef);
        
        if (snapshot.exists()) {
          const sessions = snapshot.val();
          
          // Set ALL sessions to inactive first (including this one temporarily)
          for (const [sessionId, sessionData] of Object.entries(sessions)) {
            const session = sessionData as SessionData;
            // Deactivate ALL sessions, even in the same room
            updates[`Presence/${this.userId}/sessions/${sessionId}/isActive`] = false;
            updates[`Presence/${this.userId}/sessions/${sessionId}/lastSeen`] = serverTimestamp();
            
            // If this session has an active task and is in a different room, pause it
            if (session.roomId !== this.roomId && session.currentTaskId) {
              const taskRef = `TaskBuffer/${this.userId}/${session.currentTaskId}`;
              const taskSnapshot = await get(ref(rtdb, taskRef));
              
              if (taskSnapshot.exists()) {
                const taskData = taskSnapshot.val();
                if (taskData.status === 'in_progress') {
                  // Pause the task
                  updates[`${taskRef}/status`] = 'paused';
                  updates[`${taskRef}/pausedAt`] = serverTimestamp();
                  
                  // Update timer state if it exists
                  const timerRef = `TaskBuffer/${this.userId}/timer`;
                  const timerSnapshot = await get(ref(rtdb, timerRef));
                  if (timerSnapshot.exists() && timerSnapshot.val().isRunning) {
                    updates[`${timerRef}/isRunning`] = false;
                    updates[`${timerRef}/lastPaused`] = serverTimestamp();
                  }
                }
              }
            }
          }
        }
        
        // Also update RoomIndex for ALL rooms (including current one)
        const roomIndexRef = ref(rtdb, 'RoomIndex');
        const roomIndexSnapshot = await get(roomIndexRef);
        if (roomIndexSnapshot.exists()) {
          const allRooms = roomIndexSnapshot.val();
          for (const [roomId, users] of Object.entries(allRooms)) {
            if (users && (users as Record<string, unknown>)[this.userId]) {
              updates[`RoomIndex/${roomId}/${this.userId}/isActive`] = false;
              updates[`RoomIndex/${roomId}/${this.userId}/lastUpdated`] = serverTimestamp();
            }
          }
        }
        
        // Now set only the current session and room to active
        updates[`Presence/${this.userId}/sessions/${this.sessionId}/isActive`] = true;
        updates[`Presence/${this.userId}/sessions/${this.sessionId}/lastSeen`] = serverTimestamp();
        updates[`RoomIndex/${this.roomId}/${this.userId}/isActive`] = true;
        updates[`RoomIndex/${this.roomId}/${this.userId}/lastUpdated`] = serverTimestamp();
        
        // Apply all updates atomically
        await update(ref(rtdb), updates);
      } else {
        // If deactivating, just update current session and room
        await update(this.sessionRef, {
          isActive: false,
          lastSeen: serverTimestamp()
        });
        
        await update(this.roomIndexRef, {
          isActive: false,
          lastUpdated: serverTimestamp()
        });
      }
      
      this.lastActiveState = isActive;
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
        
        // Update our presence (always include roomId to prevent loss)
        await update(this.sessionRef, {
          lastSeen: serverTimestamp(),
          tabVisible: document.visibilityState === 'visible',
          roomId: this.roomId  // Ensure roomId is never lost
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
        lastSeen: serverTimestamp(),
        roomId: this.roomId  // Ensure roomId is never lost
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
      // Always include roomId in heartbeat to ensure it's never lost
      await update(this.sessionRef, {
        lastSeen: serverTimestamp(),
        roomId: this.roomId  // Ensure roomId is always present
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
  
  private setupSessionMonitor(): void {
    // Listen to this specific session for changes
    this.sessionMonitorHandler = async (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) return;
      
      const sessionData = snapshot.val();
      
      // If roomId is missing, fix it immediately
      if (!sessionData.roomId && this.roomId) {
        console.warn('[PresenceService] Session lost roomId, self-healing...', {
          sessionId: this.sessionId,
          userId: this.userId,
          expectedRoomId: this.roomId
        });
        
        try {
          // Restore all session data with the correct roomId
          await update(this.sessionRef, {
            ...sessionData,
            roomId: this.roomId,
            lastSeen: serverTimestamp()
          });
          console.log('[PresenceService] Successfully restored roomId');
        } catch (error) {
          console.error('[PresenceService] Failed to restore roomId:', error);
        }
      }
    };
    
    onValue(this.sessionRef, this.sessionMonitorHandler);
  }

  private getDeviceInfo(): string {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }




  // Static helper methods
  
  // TEST FUNCTION: Manually remove roomId to test auto-healing
  static async testRemoveRoomId(userId: string, sessionId: string): Promise<void> {
    try {
      const sessionRef = ref(rtdb, `Presence/${userId}/sessions/${sessionId}`);
      console.log('🧪 TEST: Removing roomId from session', { userId, sessionId });
      await update(sessionRef, {
        roomId: null
      });
      console.log('🧪 TEST: roomId removed - auto-healing should trigger soon');
    } catch (error) {
      console.error('🧪 TEST: Failed to remove roomId:', error);
    }
  }
  
  // Fix orphaned sessions without roomId
  static async fixOrphanedSessions(): Promise<void> {
    try {
      const presenceRef = ref(rtdb, 'Presence');
      const snapshot = await get(presenceRef);
      
      if (!snapshot.exists()) return;
      
      const allUsers = snapshot.val();
      const updates: Record<string, null> = {};
      
      for (const [userId, userData] of Object.entries(allUsers)) {
        const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
        if (!userSessions) continue;
        
        for (const [sessionId, sessionData] of Object.entries(userSessions)) {
          const session = sessionData as SessionData & { roomId?: string; lastSeen?: number };
          
          // If session has no roomId but is recent (within 2 minutes), remove it
          if (!session.roomId && typeof session.lastSeen === 'number') {
            const now = Date.now();
            if (now - session.lastSeen < 120000) {
              // Recent orphaned session - just remove it
              console.warn('[PresenceService] Removing orphaned session:', {
                userId,
                sessionId,
                lastSeen: new Date(session.lastSeen).toISOString()
              });
              updates[`Presence/${userId}/sessions/${sessionId}`] = null;
            }
          }
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await update(ref(rtdb), updates);
        console.log(`[PresenceService] Fixed ${Object.keys(updates).length} orphaned sessions`);
      }
    } catch (error) {
      console.error('[PresenceService] Failed to fix orphaned sessions:', error);
    }
  }

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

  // Static method to update presence for a specific user/room from anywhere (e.g., button hooks)
  static async updateUserPresence(userId: string, roomId: string, isActive: boolean, taskInfo?: { taskId?: string; taskName?: string }): Promise<void> {
    try {
      const updates: Record<string, boolean | object | string | null> = {};
      
      // If becoming active, we need to deactivate all other rooms first
      if (isActive) {
        // Get all sessions for this user
        const userPresenceRef = ref(rtdb, `Presence/${userId}/sessions`);
        const snapshot = await get(userPresenceRef);
        
        if (snapshot.exists()) {
          const sessions = snapshot.val();
          
          // Deactivate ALL sessions first
          for (const [sessionId, sessionData] of Object.entries(sessions)) {
            const session = sessionData as SessionData;
            updates[`Presence/${userId}/sessions/${sessionId}/isActive`] = false;
            updates[`Presence/${userId}/sessions/${sessionId}/lastSeen`] = serverTimestamp();
            
            // If session is in a different room and has active task, pause it
            if (session.roomId !== roomId && session.currentTaskId) {
              const taskRef = `TaskBuffer/${userId}/${session.currentTaskId}`;
              const taskSnapshot = await get(ref(rtdb, taskRef));
              
              if (taskSnapshot.exists()) {
                const taskData = taskSnapshot.val();
                if (taskData.status === 'in_progress') {
                  updates[`${taskRef}/status`] = 'paused';
                  updates[`${taskRef}/pausedAt`] = serverTimestamp();
                  
                  const timerRef = `TaskBuffer/${userId}/timer`;
                  const timerSnapshot = await get(ref(rtdb, timerRef));
                  if (timerSnapshot.exists() && timerSnapshot.val().isRunning) {
                    updates[`${timerRef}/isRunning`] = false;
                    updates[`${timerRef}/lastPaused`] = serverTimestamp();
                  }
                }
              }
            }
          }
          
          // Then activate only sessions in the target room
          for (const [sessionId, sessionData] of Object.entries(sessions)) {
            const session = sessionData as SessionData;
            if (session.roomId === roomId) {
              updates[`Presence/${userId}/sessions/${sessionId}/isActive`] = true;
              updates[`Presence/${userId}/sessions/${sessionId}/lastSeen`] = serverTimestamp();
              if (taskInfo?.taskId) {
                updates[`Presence/${userId}/sessions/${sessionId}/currentTaskId`] = taskInfo.taskId;
                updates[`Presence/${userId}/sessions/${sessionId}/currentTaskName`] = taskInfo.taskName || "Untitled Task";
              }
            }
          }
        }
        
        // Deactivate all room indexes first
        const roomIndexRef = ref(rtdb, 'RoomIndex');
        const roomIndexSnapshot = await get(roomIndexRef);
        if (roomIndexSnapshot.exists()) {
          const allRooms = roomIndexSnapshot.val();
          for (const [rId, users] of Object.entries(allRooms)) {
            if (users && (users as Record<string, unknown>)[userId]) {
              updates[`RoomIndex/${rId}/${userId}/isActive`] = false;
              updates[`RoomIndex/${rId}/${userId}/lastUpdated`] = serverTimestamp();
            }
          }
        }
        
        // Then activate only the target room
        updates[`RoomIndex/${roomId}/${userId}/isActive`] = true;
        updates[`RoomIndex/${roomId}/${userId}/lastUpdated`] = serverTimestamp();
        if (taskInfo?.taskId) {
          updates[`RoomIndex/${roomId}/${userId}/currentTaskId`] = taskInfo.taskId;
          updates[`RoomIndex/${roomId}/${userId}/currentTaskName`] = taskInfo.taskName || "Untitled Task";
        }
      } else {
        // If deactivating, just update this room
        updates[`RoomIndex/${roomId}/${userId}/isActive`] = false;
        updates[`RoomIndex/${roomId}/${userId}/lastUpdated`] = serverTimestamp();
        updates[`RoomIndex/${roomId}/${userId}/currentTaskId`] = null;
        updates[`RoomIndex/${roomId}/${userId}/currentTaskName`] = null;
        
        // Update sessions in this room
        const userPresenceRef = ref(rtdb, `Presence/${userId}/sessions`);
        const snapshot = await get(userPresenceRef);
        
        if (snapshot.exists()) {
          const sessions = snapshot.val();
          for (const [sessionId, sessionData] of Object.entries(sessions)) {
            const session = sessionData as SessionData;
            if (session.roomId === roomId) {
              updates[`Presence/${userId}/sessions/${sessionId}/isActive`] = false;
              updates[`Presence/${userId}/sessions/${sessionId}/lastSeen`] = serverTimestamp();
              updates[`Presence/${userId}/sessions/${sessionId}/currentTaskId`] = null;
              updates[`Presence/${userId}/sessions/${sessionId}/currentTaskName`] = null;
            }
          }
        }
      }
      
      // Apply all updates atomically
      if (Object.keys(updates).length > 0) {
        await update(ref(rtdb), updates);
      }
    } catch (error) {
      console.error('[PresenceService] Failed to update user presence:', error);
    }
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