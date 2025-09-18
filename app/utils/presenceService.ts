import { rtdb } from "@/lib/firebase";
import { ref, set, onDisconnect, onValue, off, get, remove, push, serverTimestamp, update } from "firebase/database";
import type { DataSnapshot } from "firebase/database";
import { removeUserFromPublicRoom } from "./publicRooms";
import { removeUserFromPrivateRoom } from "./privateRooms";

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
const TAB_COUNT_OFFLINE_THRESHOLD = 70000;

type RoomType = 'public' | 'private' | 'unknown';

// Debug logging helper  
const log = (level: 'info' | 'warn' | 'error', message: string, data?: unknown) => {
  // Check localStorage each time for dynamic toggling
  const debugEnabled = typeof window !== 'undefined' ? 
    localStorage.getItem('presence_debug') === 'true' : false;
    
  if (!debugEnabled) return;
  
  const timestamp = new Date().toISOString();
  const prefix = `[PRESENCE ${timestamp}]`;
  
  switch (level) {
    case 'error':
      console.error(prefix, message, data || '');
      break;
    case 'warn':
      console.warn(prefix, message, data || '');
      break;
    default:
      console.log(prefix, message, data || '');
  }
};

type FirebaseUpdateValue = string | number | boolean | null | ReturnType<typeof serverTimestamp>;

export class PresenceService {
  private userId: string;
  private roomId: string;
  private sessionId: string;
  private sessionRef: ReturnType<typeof ref>;
  private userPresenceRef: ReturnType<typeof ref>;
  private roomIndexRef: ReturnType<typeof ref>;
  private tabSessionRef: ReturnType<typeof ref>;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private visibilityHandler: (() => void) | null = null;
  private connectionHandler: ((snap: DataSnapshot) => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private sessionMonitorHandler: ((snap: DataSnapshot) => void) | null = null;
  private disconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private roomIndexDisconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private tabSessionDisconnectRef: ReturnType<typeof onDisconnect> | null = null;
  private isInitialized = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastActiveState = false;
  private heartbeatFailures = 0;
  private maxHeartbeatFailures = 3;
  private roomType: RoomType;

  constructor(userId: string, roomId: string, options: { roomType?: 'public' | 'private' } = {}) {
    if (!userId || !roomId) {
      log('error', 'Invalid constructor params', { userId, roomId });
    }
    this.userId = userId;
    this.roomId = roomId;
    this.roomType = options.roomType ?? 'unknown';
    // Generate a unique session ID
    this.sessionId = push(ref(rtdb, 'sessions')).key!;
    this.sessionRef = ref(rtdb, `Presence/${userId}/sessions/${this.sessionId}`);
    this.userPresenceRef = ref(rtdb, `Presence/${userId}`);
    this.roomIndexRef = ref(rtdb, `RoomIndex/${roomId}/${userId}`);
    this.tabSessionRef = ref(rtdb, `tabCounts/${userId}/sessions/${this.sessionId}`);
    
    log('info', 'PresenceService created', {
      userId,
      roomId, 
      sessionId: this.sessionId
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string {
    return this.userId;
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      log('warn', 'Already initialized', { sessionId: this.sessionId });
      return true;
    }

    log('info', 'Initializing presence', {
      userId: this.userId,
      roomId: this.roomId,
      sessionId: this.sessionId
    });

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
      log('info', 'Setting up onDisconnect handlers', { sessionId: this.sessionId });
      this.disconnectRef = onDisconnect(this.sessionRef);
      await this.disconnectRef.remove();
      
      // Set up onDisconnect for room index  
      this.roomIndexDisconnectRef = onDisconnect(this.roomIndexRef);
      await this.roomIndexDisconnectRef.update({
        lastUpdated: serverTimestamp()
      });
      
      this.tabSessionDisconnectRef = onDisconnect(this.tabSessionRef);
      await this.tabSessionDisconnectRef.remove();
      log('info', 'onDisconnect handlers configured', { sessionId: this.sessionId });

      // Now set the presence
      log('info', 'Setting initial presence', { sessionId: this.sessionId, sessionData });
      await set(this.sessionRef, sessionData);
      
      // Also set initial room index entry (preserve existing active state if present)
      const existingRoomIndex = await get(this.roomIndexRef);
      const existingData: { isActive?: boolean; joinedAt?: number | object } | null = existingRoomIndex.exists()
        ? (existingRoomIndex.val() as { isActive?: boolean; joinedAt?: number | object })
        : null;
      const roomIndexPayload: {
        userId: string;
        joinedAt: number | object;
        lastUpdated: number | object;
        isActive?: boolean;
      } = {
        userId: this.userId,
        joinedAt: existingData?.joinedAt ?? serverTimestamp(),
        lastUpdated: serverTimestamp()
      };
      if (existingData?.isActive === true) {
        roomIndexPayload.isActive = true;
      } else if (!existingRoomIndex.exists()) {
        roomIndexPayload.isActive = false;
      }
      await update(this.roomIndexRef, roomIndexPayload);
      const initialHeartbeat = Date.now();
      await set(this.tabSessionRef, {
        userId: this.userId,
        sessionId: this.sessionId,
        roomId: this.roomId,
        roomType: this.roomType,
        lastSeen: initialHeartbeat
      });
      
      log('info', 'Initial presence set successfully', { sessionId: this.sessionId });

      // Set up visibility tracking
      this.setupVisibilityTracking();
      
      // Set up beforeunload handler for immediate cleanup
      this.setupBeforeUnloadHandler();
      
      // Set up self-healing listener for this session
      this.setupSessionMonitor();

      // Start heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      log('info', '✅ Presence initialized successfully', {
        userId: this.userId,
        roomId: this.roomId,
        sessionId: this.sessionId
      });

      await this.refreshTabCount(initialHeartbeat, {
        roomId: this.roomId,
        roomType: this.roomType
      });
      return true;
    } catch (error) {
      log('error', '❌ Initialization failed', { 
        error, 
        sessionId: this.sessionId,
        userId: this.userId,
        roomId: this.roomId
      });
      return false;
    }
  }

  async cleanup(): Promise<void> {
    log('info', '🧹 Starting cleanup', { 
      sessionId: this.sessionId,
      userId: this.userId,
      roomId: this.roomId 
    });
    
    // Stop all listeners and intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      log('info', 'Heartbeat stopped', { sessionId: this.sessionId });
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

    // Remove presence nodes; allow heartbeat/offline sweep to tidy room index
    try {
      await remove(this.sessionRef);
      await remove(this.tabSessionRef);
    } catch (error) {
      log('warn', 'Presence already removed or error during removal', { 
        error, 
        sessionId: this.sessionId 
      });
    }

    this.isInitialized = false;
    log('info', '✅ Cleanup complete', { sessionId: this.sessionId });
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
    if (!this.isInitialized) {
      log('warn', 'Cannot setActive - not initialized', { sessionId: this.sessionId });
      return;
    }

    if (this.lastActiveState === isActive) {
      if (!isActive) {
        // Still refresh lastSeen to keep session warm
        await update(this.sessionRef, {
          lastSeen: serverTimestamp(),
          roomId: this.roomId
        }).catch(() => {});
      }
      return;
    }

    log('info', `🔄 Setting active status: ${isActive}`, {
      sessionId: this.sessionId,
      userId: this.userId,
      roomId: this.roomId,
      previousState: this.lastActiveState,
      newState: isActive
    });

    try {
      // If becoming active, ALWAYS deactivate all other sessions regardless of current state
      if (isActive) {
        const updates: Record<string, FirebaseUpdateValue> = {};
        
        // Get all sessions for this user
        const allSessionsRef = ref(rtdb, `Presence/${this.userId}/sessions`);
        const snapshot = await get(allSessionsRef);
        
        if (snapshot.exists()) {
          const sessions = snapshot.val();
          const sessionCount = Object.keys(sessions).length;
          log('info', `Found ${sessionCount} sessions to manage`, {
            sessionId: this.sessionId,
            totalSessions: sessionCount
          });
          
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
        const updateCount = Object.keys(updates).length;
        log('info', `Applying ${updateCount} atomic updates`, { sessionId: this.sessionId });
        await update(ref(rtdb), updates);
        log('info', '✅ Active status updated successfully', { 
          sessionId: this.sessionId,
          isActive
        });
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
      log('error', '❌ Failed to update active status', { 
        error, 
        sessionId: this.sessionId,
        attemptedState: isActive
      });
      throw error; // Re-throw to let caller handle
    }
  }

  private setupConnectionListener(): void {
    const connectedRef = ref(rtdb, '.info/connected');
    
    this.connectionHandler = async (snap: DataSnapshot) => {
      const isConnected = snap.val() === true;
      log('info', `🌐 Connection state changed: ${isConnected ? 'CONNECTED' : 'DISCONNECTED'}`, {
        sessionId: this.sessionId,
        userId: this.userId,
        roomId: this.roomId,
        timestamp: new Date().toISOString()
      });
      
      if (isConnected) {
        // We're connected (or reconnected)
        log('info', '🔄 Re-establishing presence after connection', { sessionId: this.sessionId });
        
        // Re-establish onDisconnect
        try {
          if (this.disconnectRef) {
            await this.disconnectRef.cancel();
          }
          this.disconnectRef = onDisconnect(this.sessionRef);
          await this.disconnectRef.remove();
          
          if (this.roomIndexDisconnectRef) {
            await this.roomIndexDisconnectRef.cancel();
          }
          this.roomIndexDisconnectRef = onDisconnect(this.roomIndexRef);
          await this.roomIndexDisconnectRef.update({
            lastUpdated: serverTimestamp()
          });

          if (this.tabSessionDisconnectRef) {
            await this.tabSessionDisconnectRef.cancel();
          }
          this.tabSessionDisconnectRef = onDisconnect(this.tabSessionRef);
          await this.tabSessionDisconnectRef.remove();
          await update(this.tabSessionRef, {
            userId: this.userId,
            sessionId: this.sessionId,
            roomId: this.roomId,
            roomType: this.roomType,
            lastSeen: Date.now()
          });
          await this.refreshTabCount(Date.now());
          
          log('info', '✅ onDisconnect handlers re-established', { sessionId: this.sessionId });
        } catch (error) {
          log('error', '❌ Failed to re-establish onDisconnect handlers', { 
            error, 
            sessionId: this.sessionId 
          });
        }
        
        // Update our presence (always include roomId to prevent loss)
        await update(this.sessionRef, {
          lastSeen: serverTimestamp(),
          tabVisible: document.visibilityState === 'visible',
          roomId: this.roomId  // Ensure roomId is never lost
        });
          const roomIndexUpdate: { userId: string; lastUpdated: number | object; isActive?: boolean } = {
            userId: this.userId,
            lastUpdated: serverTimestamp()
          };
        if (this.lastActiveState) {
          roomIndexUpdate.isActive = true;
        }
        await update(this.roomIndexRef, roomIndexUpdate);
        
        // Restart heartbeat if it was stopped
        if (!this.heartbeatInterval && this.isInitialized) {
          log('info', '💓 Restarting heartbeat after reconnection', { sessionId: this.sessionId });
          this.startHeartbeat();
        }
      } else {
        // We're disconnected
        log('warn', '⚠️ Connection lost - stopping heartbeat', {
          sessionId: this.sessionId,
          userId: this.userId,
          roomId: this.roomId
        });
        
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

      update(this.roomIndexRef, {
        userId: this.userId,
        lastUpdated: serverTimestamp()
      }).catch(() => {
        // Visibility update might race with disconnect; ignore errors
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

    log('info', '💓 Starting heartbeat', { 
      sessionId: this.sessionId,
      interval: HEARTBEAT_INTERVAL 
    });

    // Update immediately
    this.updateHeartbeat();

    // Then update every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }

  private async updateHeartbeat(): Promise<void> {
    if (!this.isInitialized) {
      log('warn', 'Heartbeat skipped - not initialized', { sessionId: this.sessionId });
      return;
    }

    const heartbeatTimestamp = Date.now();
    
    try {
      // Always include roomId in heartbeat to ensure it's never lost
      await update(this.sessionRef, {
        lastSeen: serverTimestamp(),
        roomId: this.roomId  // Ensure roomId is always present
      });

      await update(this.tabSessionRef, {
        lastSeen: heartbeatTimestamp,
        roomId: this.roomId,
        roomType: this.roomType
      });
      const roomIndexUpdate: { userId: string; lastUpdated: number | object; isActive?: boolean } = {
        userId: this.userId,
        lastUpdated: serverTimestamp()
      };
      if (this.lastActiveState) {
        roomIndexUpdate.isActive = true;
      }
      await update(this.roomIndexRef, roomIndexUpdate);
      
      // Reset failure count on success
      if (this.heartbeatFailures > 0) {
        log('info', `💓 Heartbeat recovered after ${this.heartbeatFailures} failures`, {
          sessionId: this.sessionId
        });
        this.heartbeatFailures = 0;
      }
      
      log('info', '💓 Heartbeat sent successfully', {
        sessionId: this.sessionId,
        timestamp: new Date(heartbeatTimestamp).toISOString()
      });

      await this.refreshTabCount(heartbeatTimestamp);
    } catch (error) {
      this.heartbeatFailures++;
      
      log('error', `❌ Heartbeat failed! (failure ${this.heartbeatFailures}/${this.maxHeartbeatFailures})`, {
        error,
        sessionId: this.sessionId,
        userId: this.userId,
        roomId: this.roomId,
        timestamp: new Date(heartbeatTimestamp).toISOString(),
        failureCount: this.heartbeatFailures
      });
      
      // If we've failed too many times, try to reinitialize
      if (this.heartbeatFailures >= this.maxHeartbeatFailures) {
        log('error', `🚨 Max heartbeat failures reached - attempting recovery`, {
          sessionId: this.sessionId
        });
        
        // Try to re-establish presence
        try {
          await this.recoverPresence();
        } catch (recoveryError) {
          log('error', `🔴 Failed to recover presence`, { 
            recoveryError,
            sessionId: this.sessionId 
          });
        }
      }
    }
  }
  
  private async refreshTabCount(now: number, context?: { roomId?: string; roomType?: RoomType }): Promise<void> {
    try {
      const sessionsRef = ref(rtdb, `tabCounts/${this.userId}/sessions`);
      const snapshot = await get(sessionsRef);
      const threshold = now - TAB_COUNT_OFFLINE_THRESHOLD;
      const updates: Record<string, FirebaseUpdateValue> = {};
      let activeCount = 0;
      const activeRooms = new Set<string>();
      const staleRooms: Array<{ roomId?: string; roomType?: RoomType }> = [];

      if (snapshot.exists()) {
      const sessions = snapshot.val() as Record<string, { lastSeen?: number; roomId?: string; roomType?: RoomType }>;
        for (const [sessionId, sessionData] of Object.entries(sessions)) {
          const lastSeen = typeof sessionData?.lastSeen === 'number' ? sessionData.lastSeen : 0;
          const sessionRoomId = sessionData?.roomId as string | undefined;
          const sessionRoomType = (sessionData?.roomType as RoomType | undefined) ?? 'unknown';

          if (lastSeen > threshold) {
            activeCount += 1;
            if (sessionRoomId) {
              activeRooms.add(sessionRoomId);
            }
          } else {
            updates[`tabCounts/${this.userId}/sessions/${sessionId}`] = null;
            staleRooms.push({ roomId: sessionRoomId, roomType: sessionRoomType });
          }
        }
      }

      if (context) {
        staleRooms.push(context);
      }

      if (activeCount > 0) {
        updates[`tabCounts/${this.userId}/count`] = activeCount;
        updates[`tabCounts/${this.userId}/lastUpdated`] = now;

        if (Object.keys(updates).length > 0) {
          await update(ref(rtdb), updates);
        }

        // Clean up any rooms that no longer have active sessions for this user
        const roomsToCleanup = staleRooms.filter(({ roomId }) => {
          if (!roomId) return false;
          return !activeRooms.has(roomId);
        });

        if (roomsToCleanup.length > 0) {
          await this.cleanupRoomMembershipIfNoTabs(roomsToCleanup);
        }
      } else {
        await remove(ref(rtdb, `tabCounts/${this.userId}`)).catch(() => {
          // Node might already be gone; ignore
        });
        await this.cleanupRoomMembershipIfNoTabs(staleRooms);
      }
    } catch (error) {
      log('error', 'Failed to refresh tab count', {
        error,
        userId: this.userId,
        sessionId: this.sessionId
      });
    }
  }

  private async cleanupRoomMembershipIfNoTabs(roomInfos: Array<{ roomId?: string; roomType?: RoomType }>): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const uniqueRooms = new Map<string, RoomType>();
    roomInfos.forEach(({ roomId, roomType }) => {
      if (!roomId) return;
      if (!uniqueRooms.has(roomId)) {
        uniqueRooms.set(roomId, roomType ?? 'unknown');
      }
    });

    const removals: Promise<void>[] = [];
    uniqueRooms.forEach((roomType, roomId) => {
      removals.push((async () => {
        const stillActive = await this.hasActiveTabSessions(roomId);
        if (stillActive) {
          return;
        }

        if (roomType === 'public') {
          await removeUserFromPublicRoom(roomId, this.userId).catch((error) => {
            log('error', 'Failed to remove user from public room on tab cleanup', {
              error,
              roomId,
              userId: this.userId
            });
          });
        } else if (roomType === 'private') {
          await removeUserFromPrivateRoom(roomId, this.userId).catch((error) => {
            log('error', 'Failed to remove user from private room on tab cleanup', {
              error,
              roomId,
              userId: this.userId
            });
          });
        }

        await remove(ref(rtdb, `RoomIndex/${roomId}/${this.userId}`)).catch((error) => {
          log('error', 'Failed to remove user from RoomIndex on tab cleanup', {
            error,
            roomId,
            userId: this.userId
          });
        });
      })());
    });

    if (removals.length > 0) {
      await Promise.all(removals);
    }
  }

  private async hasActiveTabSessions(roomIdFilter?: string): Promise<boolean> {
    const sessionsRef = ref(rtdb, `tabCounts/${this.userId}/sessions`);
    const snapshot = await get(sessionsRef);
    if (!snapshot.exists()) {
      return false;
    }

    const now = Date.now();
    const threshold = now - TAB_COUNT_OFFLINE_THRESHOLD;
    const sessions = snapshot.val() as Record<string, { lastSeen?: number; roomId?: string | null }>;

    for (const [sessionId, sessionData] of Object.entries(sessions)) {
      if (sessionId === this.sessionId) {
        continue;
      }
      if (roomIdFilter && sessionData?.roomId !== roomIdFilter) {
        continue;
      }
      const lastSeen = typeof sessionData?.lastSeen === 'number' ? sessionData.lastSeen : 0;
      if (lastSeen > threshold) {
        return true;
      }
    }

    return false;
  }
  
  private async recoverPresence(): Promise<void> {
    log('info', `🔄 Attempting presence recovery`, { sessionId: this.sessionId });
    
    try {
      // Re-establish onDisconnect handlers
      if (this.disconnectRef) {
        await this.disconnectRef.cancel();
      }
      this.disconnectRef = onDisconnect(this.sessionRef);
      await this.disconnectRef.remove();
      
      if (this.roomIndexDisconnectRef) {
        await this.roomIndexDisconnectRef.cancel();
      }
      this.roomIndexDisconnectRef = onDisconnect(this.roomIndexRef);
      await this.roomIndexDisconnectRef.update({
        lastUpdated: serverTimestamp()
      });

      // Force update presence with current state
      await update(this.sessionRef, {
        roomId: this.roomId,
        isActive: this.lastActiveState || false,
        lastSeen: serverTimestamp(),
        tabVisible: document.visibilityState === 'visible',
        device: this.getDeviceInfo(),
        recovered: true,
        recoveredAt: serverTimestamp()
      });
      
      // Update room index
      await update(this.roomIndexRef, {
        userId: this.userId,
        isActive: this.lastActiveState || false,
        lastUpdated: serverTimestamp()
      });

      await update(this.tabSessionRef, {
        userId: this.userId,
        sessionId: this.sessionId,
        roomId: this.roomId,
        roomType: this.roomType,
        lastSeen: Date.now()
      });

      await this.refreshTabCount(Date.now());
      
      // Reset failure count
      this.heartbeatFailures = 0;
      
      log('info', `✅ Presence recovered successfully`, { sessionId: this.sessionId });
    } catch (error) {
      log('error', `❌ Presence recovery failed`, { error, sessionId: this.sessionId });
      throw error;
    }
  }

  // Commenting out unused method to fix TS warning
  // This method can be re-enabled if grace period removal is needed
  /*
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
  */

  private setupBeforeUnloadHandler(): void {
    this.beforeUnloadHandler = () => {
      // Synchronously remove presence on window close
      // Can't use async in beforeunload, so we do direct Firebase calls
      if (this.isInitialized) {
        // These are fire-and-forget, best effort during unload
        remove(this.sessionRef);
        remove(this.tabSessionRef);
      }
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    window.addEventListener('pagehide', this.beforeUnloadHandler); // Better for mobile
  }
  
  private setupSessionMonitor(): void {
    // Listen to this specific session for changes
    this.sessionMonitorHandler = async (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        log('warn', '⚠️ Session disappeared from Firebase!', {
          sessionId: this.sessionId,
          userId: this.userId,
          roomId: this.roomId
        });
        return;
      }
      
      const sessionData = snapshot.val();
      
      // If roomId is missing, fix it immediately
      if (!sessionData.roomId && this.roomId) {
        log('error', '🚨 CRITICAL: Session lost roomId - attempting self-heal', {
          sessionId: this.sessionId,
          userId: this.userId,
          expectedRoomId: this.roomId,
          currentData: sessionData
        });
        
        try {
          // Restore all session data with the correct roomId
          await update(this.sessionRef, {
            ...sessionData,
            roomId: this.roomId,
            lastSeen: serverTimestamp()
          });
          log('info', '✅ Successfully restored roomId', {
            sessionId: this.sessionId,
            roomId: this.roomId
          });
        } catch (error) {
          log('error', '❌ Failed to restore roomId', { 
            error, 
            sessionId: this.sessionId,
            roomId: this.roomId
          });
        }
      } else if (sessionData.roomId !== this.roomId) {
        log('error', '🚨 Session roomId mismatch!', {
          sessionId: this.sessionId,
          expectedRoom: this.roomId,
          actualRoom: sessionData.roomId
        });
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
        // Fixed orphaned sessions
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

  // Debug helper to check presence status
  static async debugPresence(roomId?: string) {
    console.log('\n=== 🔍 PRESENCE DEBUG REPORT ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Room:', roomId || 'ALL ROOMS');
    
    const presenceRef = ref(rtdb, 'Presence');
    const presenceSnapshot = await get(presenceRef);
    
    if (!presenceSnapshot.exists()) {
      console.log('❌ No presence data found');
      return;
    }
    
    const allUsers = presenceSnapshot.val();
    const now = Date.now();
    let totalUsers = 0;
    let totalSessions = 0;
    let activeSessions = 0;
    let roomSessions = 0;
    
    console.log('\n👥 USER SESSIONS:');
    
    for (const [userId, userData] of Object.entries(allUsers)) {
      const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
      if (!userSessions) continue;
      
      totalUsers++;
      const sessions = Object.entries(userSessions);
      totalSessions += sessions.length;
      
      console.log(`\n  User: ${userId}`);
      console.log(`  Sessions: ${sessions.length}`);
      
      for (const [sessionId, session] of sessions) {
        const timeSinceLastSeen = typeof session.lastSeen === 'number' ? now - session.lastSeen : Infinity;
        const isOnline = timeSinceLastSeen < OFFLINE_THRESHOLD;
        
        if (session.isActive) activeSessions++;
        if (!roomId || session.roomId === roomId) {
          roomSessions++;
          
          console.log(`    Session ${sessionId}:`);
          console.log(`      Room: ${session.roomId}`);
          console.log(`      Active: ${session.isActive ? '✅' : '❌'}`);
          console.log(`      Online: ${isOnline ? '✅' : '❌'} (${Math.round(timeSinceLastSeen / 1000)}s ago)`);
          console.log(`      Task: ${session.currentTaskName || 'None'}`);
          console.log(`      Tab: ${session.tabVisible ? 'Visible' : 'Hidden'}`);
        }
      }
    }
    
    // Check RoomIndex
    if (roomId) {
      console.log(`\n🏠 ROOM INDEX for ${roomId}:`);
      const roomIndexRef = ref(rtdb, `RoomIndex/${roomId}`);
      const roomSnapshot = await get(roomIndexRef);
      
      if (roomSnapshot.exists()) {
        const roomData = roomSnapshot.val();
        console.log('Users in room index:', Object.keys(roomData).length);
        
        for (const [userId, userData] of Object.entries(roomData)) {
          const user = userData as { isActive?: boolean; lastUpdated?: number | object; currentTaskName?: string };
          console.log(`  ${userId}:`);
          console.log(`    Active: ${user.isActive ? '✅' : '❌'}`);
          console.log(`    Task: ${user.currentTaskName || 'None'}`);
          console.log(`    Last Updated: ${user.lastUpdated}`);
        }
      } else {
        console.log('No room index data');
      }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`Total Sessions: ${totalSessions}`);
    console.log(`Active Sessions: ${activeSessions}`);
    if (roomId) console.log(`Sessions in Room: ${roomSessions}`);
    console.log('=== END DEBUG REPORT ===\n');
  }
  
  static async getRoomSessions(roomId: string): Promise<PresenceSession[]> {
    const presenceRef = ref(rtdb, 'Presence');
    const snapshot = await get(presenceRef);
    
    if (!snapshot.exists()) {
      log('warn', `No presence data found for getRoomSessions`);
      return [];
    }

    const now = Date.now();
    const sessions: PresenceSession[] = [];
    const allUsers = snapshot.val();
    
    log('info', `🔍 Checking all users for room ${roomId}`);

    // Iterate through all users
    for (const [userId, userData] of Object.entries(allUsers)) {
      const userSessions = (userData as { sessions?: Record<string, SessionData> }).sessions;
      if (!userSessions) continue;

      // Iterate through user's sessions
      for (const [sessionId, sessionData] of Object.entries(userSessions)) {
        const session = sessionData as SessionData;
        
        // Filter by room and online status
        const isInRoom = session.roomId === roomId;
        const timeSinceLastSeen = typeof session.lastSeen === 'number' ? now - session.lastSeen : Infinity;
        const isOnline = timeSinceLastSeen < OFFLINE_THRESHOLD;
        
        if (isInRoom && isOnline) {
          log('info', `✅ User ${userId} session ${sessionId} is in room and online:`, {
            roomId: session.roomId,
            isActive: session.isActive,
            lastSeen: new Date(session.lastSeen as number).toISOString(),
            timeSinceLastSeen: `${Math.round(timeSinceLastSeen / 1000)}s ago`
          });
          
          sessions.push({
            ...session,
            sessionId,
            userId
          });
        } else if (isInRoom && !isOnline) {
          log('warn', `⚠️ User ${userId} session ${sessionId} is in room but OFFLINE:`, {
            roomId: session.roomId,
            lastSeen: typeof session.lastSeen === 'number' ? new Date(session.lastSeen).toISOString() : 'unknown',
            timeSinceLastSeen: `${Math.round(timeSinceLastSeen / 1000)}s ago`,
            threshold: `${OFFLINE_THRESHOLD / 1000}s`
          });
        }
      }
    }

    return sessions;
  }

  static async getActiveWorkers(roomId: string): Promise<PresenceSession[]> {
    const roomSessions = await this.getRoomSessions(roomId);
    const activeWorkers = roomSessions.filter(session => session.isActive);
    
    log('info', `👷 Active workers in room ${roomId}:`, {
      count: activeWorkers.length,
      workers: activeWorkers.map(w => ({ 
        userId: w.userId, 
        sessionId: w.sessionId,
        lastSeen: w.lastSeen 
      }))
    });
    
    return activeWorkers;
  }

  // Static method to update presence for a specific user/room from anywhere (e.g., button hooks)
  static async updateUserPresence(userId: string, roomId: string, isActive: boolean, taskInfo?: { taskId?: string; taskName?: string }): Promise<void> {
    // Update user presence
    
    try {
      const updates: Record<string, FirebaseUpdateValue> = {};
      
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
    
    log('info', `👁️ Setting up room presence listener`, { roomId });
    
    // Track previous state to detect real changes
    let previousState = '';
    
    const handler = (snapshot: DataSnapshot) => {
      if (!snapshot.exists()) {
        log('warn', `No presence data for room ${roomId}`);
        callback([]);
        return;
      }

      const roomData = snapshot.val();
      const sessions: PresenceSession[] = [];
      
      log('info', `📄 Raw RoomIndex data for ${roomId}:`, roomData);
      
      // roomData structure: { userId: { isActive, joinedAt, ... } }
      for (const [userId, userData] of Object.entries(roomData)) {
        const user = userData as { isActive?: boolean; lastUpdated?: number | object; joinedAt?: number | object; currentTaskName?: string };
        
        log('info', `User ${userId} in room:`, {
          isActive: user.isActive,
          lastUpdated: user.lastUpdated,
          currentTask: user.currentTaskName
        });
        
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

      // Create a state signature to detect real changes (ignore timestamp updates)
      const stateSignature = sessions
        .map(s => `${s.userId}:${s.isActive ? 'active' : 'idle'}`)
        .sort()
        .join('|');
      
      // Only call callback if there's a meaningful change
      if (stateSignature !== previousState) {
        previousState = stateSignature;
        
        log('info', `📊 Meaningful change detected in room ${roomId}:`, {
          activeCount: sessions.filter(s => s.isActive).length,
          activeUsers: sessions.filter(s => s.isActive).map(s => s.userId),
          stateSignature
        });
        
        callback(sessions);
      } else {
        // Just a timestamp update, ignore
        log('info', `⏱️ Timestamp-only update ignored for room ${roomId}`);
      }
    };

    onValue(roomIndexRef, handler);

    // Return cleanup function
    return () => {
      off(roomIndexRef, 'value', handler);
    };
  }
}
