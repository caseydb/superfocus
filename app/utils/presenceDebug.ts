// Global debug utilities for presence monitoring
import { PresenceService } from './presenceService';

// Make debug functions globally available in browser console
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).presenceDebug = {
    // Check presence status for a specific room or all rooms
    check: async (roomId?: string) => {
      await PresenceService.debugPresence(roomId);
    },
    
    // Get active workers in a room
    getActive: async (roomId: string) => {
      const workers = await PresenceService.getActiveWorkers(roomId);
      console.log(`Active workers in room ${roomId}:`, workers);
      return workers;
    },
    
    // Get all sessions for a room
    getSessions: async (roomId: string) => {
      const sessions = await PresenceService.getRoomSessions(roomId);
      console.log(`All sessions in room ${roomId}:`, sessions);
      return sessions;
    },
    
    // Get total online users
    getTotalOnline: async () => {
      const count = await PresenceService.getTotalOnlineUsers();
      console.log(`Total online users: ${count}`);
      return count;
    },
    
    // Enable/disable debug logging
    setDebugMode: (enabled: boolean) => {
      localStorage.setItem('presence_debug', enabled ? 'true' : 'false');
      console.log(`Presence debug mode: ${enabled ? 'ON' : 'OFF'}`);
      if (enabled) {
        console.log('Reload the page to see detailed presence logs');
      }
    },
    
    // Help command
    help: () => {
      console.log(`
🔍 PRESENCE DEBUG COMMANDS:
===========================
presenceDebug.check()           - Check all rooms
presenceDebug.check('roomId')   - Check specific room
presenceDebug.getActive('roomId') - Get active workers in room
presenceDebug.getSessions('roomId') - Get all sessions in room
presenceDebug.getTotalOnline()  - Get total online users count
presenceDebug.setDebugMode(true/false) - Enable/disable debug logging
presenceDebug.help()            - Show this help

Example:
  presenceDebug.check('-OZGRkWL6jMEwsQ0gHPR')
      `);
    }
  };
  
  // Auto-show help on first load
  console.log('🔍 Presence debug tools loaded. Type "presenceDebug.help()" for commands');
}

export {};