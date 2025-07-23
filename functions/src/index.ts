/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
// setGlobalOptions({ maxInstances: 10 });

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

admin.initializeApp();

export const cleanUpEmptyPublicRooms = functions.database
  .ref("/instances/{instanceId}/users")
  .onDelete(async (snapshot, context) => {
    const instanceId = context.params.instanceId;
    const instanceRef = admin.database().ref(`/instances/${instanceId}`);

    // Get the instance data
    const instanceSnap = await instanceRef.once("value");
    const instance = instanceSnap.val();

    // Only delete if it's a public room
    if (instance && instance.type === "public") {
      // Check if users node is now empty or missing
      if (!instance.users || Object.keys(instance.users).length === 0) {
        await instanceRef.remove();
      }
    }
    return null;
  });

// Clean up empty PublicRooms when users node is deleted
export const cleanUpEmptyPublicRoomsNew = functions.database
  .ref("/PublicRooms/{roomId}/users")
  .onDelete(async (snapshot, context) => {
    const roomId = context.params.roomId;
    const roomRef = admin.database().ref(`/PublicRooms/${roomId}`);

    // Get the room data
    const roomSnap = await roomRef.once("value");
    const room = roomSnap.val();

    if (room) {
      // Check if users node is now empty or missing
      if (!room.users || Object.keys(room.users).length === 0) {
        // Also clean up any presence data
        const presenceRef = admin.database().ref(`/PublicRoomPresence/${roomId}`);
        await presenceRef.remove();

        // Delete the room
        await roomRef.remove();
      }
    }
    return null;
  });

// Update PublicRoom userCount when users change
export const updatePublicRoomUserCount = functions.database
  .ref("/PublicRooms/{roomId}/users/{userId}")
  .onWrite(async (change, context) => {
    const roomId = context.params.roomId;
    
    // Get the room reference
    const roomRef = admin.database().ref(`/PublicRooms/${roomId}`);
    const roomSnapshot = await roomRef.once("value");
    
    if (!roomSnapshot.exists()) {
      return null;
    }
    
    const room = roomSnapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    
    
    // Update the user count
    await roomRef.child("userCount").set(userCount);
    
    // If userCount is 0, delete the room
    if (userCount === 0) {
      await roomRef.remove();
      
      // Also clean up presence data
      const presenceRef = admin.database().ref(`/PublicRoomPresence/${roomId}`);
      await presenceRef.remove();
    }
    
    return null;
  });

// Clean up stale PrivateRoom presence data (runs every hour)
export const cleanUpStalePrivateRoomPresence = functions.pubsub.schedule("every 60 minutes").onRun(async (context) => {

  const now = Date.now();
  const STALE_THRESHOLD = 60 * 60 * 1000; // 1 hour

  try {
    const presenceRef = admin.database().ref("/PrivateRoomPresence");
    const snapshot = await presenceRef.once("value");

    if (!snapshot.exists()) {
      return null;
    }

    const rooms = snapshot.val();
    const cleanupPromises: Promise<void>[] = [];

    for (const [roomId, users] of Object.entries(rooms)) {
      let hasActiveUser = false;

      for (const [, data] of Object.entries(users as Record<string, any>)) {
        if (now - data.lastSeen < STALE_THRESHOLD) {
          hasActiveUser = true;
          break;
        }
      }

      // If no active users in the last hour, clean up presence data
      if (!hasActiveUser) {
        cleanupPromises.push(admin.database().ref(`/PrivateRoomPresence/${roomId}`).remove());
      }
    }

    await Promise.all(cleanupPromises);
  } catch (error) {
  }

  return null;
});

// Clean up stale ActiveWorker entries (runs every hour)
export const cleanUpStaleActiveWorkers = functions.pubsub.schedule("every 60 minutes").onRun(async (context) => {
  const now = Date.now();
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

  try {
    const activeWorkersRef = admin.database().ref("/ActiveWorker");
    const snapshot = await activeWorkersRef.once("value");

    if (!snapshot.exists()) {
      return null;
    }

    const workers = snapshot.val();
    const cleanupPromises: Promise<void>[] = [];

    for (const [userId, workerData] of Object.entries(workers)) {
      const data = workerData as { lastSeen?: number; isActive?: boolean };
      
      // If lastSeen is older than 24 hours, remove the entry
      if (data.lastSeen && (now - data.lastSeen) > STALE_THRESHOLD) {
        cleanupPromises.push(admin.database().ref(`/ActiveWorker/${userId}`).remove());
      }
    }

    await Promise.all(cleanupPromises);
  } catch (error) {
    // Silent error handling
  }

  return null;
});
