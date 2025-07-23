import { PublicRoomPresence } from './publicRoomPresence';

// Run cleanup every 30 seconds for faster response
const CLEANUP_INTERVAL = 30 * 1000;

let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupScheduler() {
  if (cleanupInterval) return; // Already running
  
  // Run cleanup immediately
  runCleanup();
  
  // Then run every 30 seconds
  cleanupInterval = setInterval(() => {
    runCleanup();
  }, CLEANUP_INTERVAL);
}

async function runCleanup() {
  try {
    // Check for stale rooms (as a backup to Cloud Functions)
    await PublicRoomPresence.cleanupStaleRooms();
  } catch {
    // Silent error handling - error details not needed
  }
}

export function stopCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}