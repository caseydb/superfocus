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

// Clean up empty EphemeralRooms when users node is deleted
// DISABLED FOR DEBUGGING
/*
export const cleanUpEmptyEphemeralRooms = functions.database
  .ref("/EphemeralRooms/{roomId}/users")
  .onDelete(async (snapshot, context) => {
    const roomId = context.params.roomId;
    const roomRef = admin.database().ref(`/EphemeralRooms/${roomId}`);

    // Small delay to ensure all operations are complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Get the room data
    const roomSnap = await roomRef.once("value");
    
    if (!roomSnap.exists()) {
      // Room already deleted
      return null;
    }
    
    const room = roomSnap.val();

    // If users node is missing or empty, delete the room
    if (!room.users || (typeof room.users === 'object' && Object.keys(room.users).length === 0)) {
      // Also clean up any presence data
      const presenceRef = admin.database().ref(`/PublicRoomPresence/${roomId}`);
      await presenceRef.remove();

      // Delete the room
      await roomRef.remove();
    }
    
    return null;
  });
*/

// Update EphemeralRoom userCount when users change
// DISABLED FOR DEBUGGING
/*
export const updateEphemeralRoomUserCount = functions.database
  .ref("/EphemeralRooms/{roomId}/users/{userId}")
  .onWrite(async (change, context) => {
    const roomId = context.params.roomId;
    
    // Small delay to let any batch operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get the room reference
    const roomRef = admin.database().ref(`/EphemeralRooms/${roomId}`);
    const roomSnapshot = await roomRef.once("value");
    
    if (!roomSnapshot.exists()) {
      return null;
    }
    
    const room = roomSnapshot.val();
    
    // If users node doesn't exist or is empty, set count to 0 and delete room
    if (!room.users || typeof room.users !== 'object') {
      await roomRef.remove();
      return null;
    }
    
    const userCount = Object.keys(room.users).length;
    
    // Update the user count
    await roomRef.update({ userCount });
    
    // If userCount is 0, delete the room
    if (userCount === 0) {
      await roomRef.remove();
      
      // Also clean up presence data
      const presenceRef = admin.database().ref(`/PublicRoomPresence/${roomId}`);
      await presenceRef.remove();
    }
    
    return null;
  });
*/

// Clean up stale PrivateRoom users (runs every 1 minute for testing)
export const cleanUpStalePrivateRoomUsers = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
  const now = Date.now();
  const STALE_THRESHOLD = 70 * 1000; // 70 seconds (same as Presence system)

  try {
    const privateRoomsRef = admin.database().ref("/PrivateRooms");
    const snapshot = await privateRoomsRef.once("value");

    if (!snapshot.exists()) {
      return null;
    }

    const rooms = snapshot.val();
    const updates: { [path: string]: any } = {};

    for (const [roomId, roomData] of Object.entries(rooms)) {
      const room = roomData as any;
      if (!room.users) continue;

      let userCountChanged = false;

      // Check each user in the room
      for (const [userId] of Object.entries(room.users)) {
        
        // Check if user has an active presence session
        const presenceSnapshot = await admin.database()
          .ref(`Presence/${userId}/sessions`)
          .once("value");
        
        let hasActiveSession = false;
        if (presenceSnapshot.exists()) {
          const sessions = presenceSnapshot.val();
          for (const sessionData of Object.values(sessions)) {
            const session = sessionData as any;
            if (session.roomId === roomId && 
                typeof session.lastSeen === 'number' && 
                (now - session.lastSeen) < STALE_THRESHOLD) {
              hasActiveSession = true;
              break;
            }
          }
        }

        // If no active session for this room, remove user
        if (!hasActiveSession) {
          updates[`PrivateRooms/${roomId}/users/${userId}`] = null;
          userCountChanged = true;
        }
      }

      // Update user count if any users were removed
      if (userCountChanged) {
        const remainingUsers = Object.keys(room.users).filter(userId => 
          updates[`PrivateRooms/${roomId}/users/${userId}`] !== null
        );
        updates[`PrivateRooms/${roomId}/userCount`] = remainingUsers.length;
      }
    }

    // Apply all updates at once
    if (Object.keys(updates).length > 0) {
      await admin.database().ref().update(updates);
      console.log(`[cleanUpStalePrivateRoomUsers] Cleaned up ${Object.keys(updates).length} entries`);
    }

  } catch (error) {
    console.error('[cleanUpStalePrivateRoomUsers] Error:', error);
  }

  return null;
});

// Clean up empty EphemeralRooms (runs every 30 seconds)
// DISABLED FOR DEBUGGING
/*
export const cleanUpEmptyEphemeralRoomsScheduled = functions.pubsub.schedule("every 30 seconds").onRun(async (context) => {
  try {
    const ephemeralRoomsRef = admin.database().ref("/EphemeralRooms");
    const snapshot = await ephemeralRoomsRef.once("value");

    if (!snapshot.exists()) {
      return null;
    }

    const rooms = snapshot.val();
    const roomsToDelete: string[] = [];

    // Check each room
    for (const [roomId, roomData] of Object.entries(rooms)) {
      const room = roomData as any;
      
      // If room has no users or users is empty, mark for deletion
      if (!room.users || (typeof room.users === 'object' && Object.keys(room.users).length === 0)) {
        roomsToDelete.push(roomId);
      }
    }

    // Delete empty rooms
    const deletePromises = roomsToDelete.map(roomId => {
      return admin.database().ref(`/EphemeralRooms/${roomId}`).remove();
    });

    await Promise.all(deletePromises);

    if (roomsToDelete.length > 0) {
      console.log(`[cleanUpEmptyEphemeralRooms] Deleted ${roomsToDelete.length} empty ephemeral rooms`);
    }

  } catch (error) {
    console.error('[cleanUpEmptyEphemeralRooms] Error:', error);
  }

  return null;
});
*/

// Clean up stale Presence sessions (runs every 1 minute for testing)
export const cleanUpStalePresenceSessions = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
  const now = Date.now();
  const STALE_THRESHOLD = 70 * 1000; // 70 seconds (5 seconds after offline threshold)

  try {
    const presenceRef = admin.database().ref("/Presence");
    const roomIndexRef = admin.database().ref("/RoomIndex");
    
    const [presenceSnapshot, roomIndexSnapshot] = await Promise.all([
      presenceRef.once("value"),
      roomIndexRef.once("value")
    ]);

    const cleanupPromises: Promise<void>[] = [];

    // Clean up Presence sessions
    if (presenceSnapshot.exists()) {
      const allUsers = presenceSnapshot.val();

      // Iterate through all users
      for (const [userId, userData] of Object.entries(allUsers)) {
        const sessions = (userData as any).sessions;
        if (!sessions) continue;

        // Check each session
        for (const [sessionId, sessionData] of Object.entries(sessions)) {
          const session = sessionData as any;
          
          // If lastSeen is older than stale threshold, remove the session
          if (typeof session.lastSeen === 'number' && 
              (now - session.lastSeen) > STALE_THRESHOLD) {
            cleanupPromises.push(
              admin.database().ref(`/Presence/${userId}/sessions/${sessionId}`).remove()
            );
          }
        }
      }
    }

    // Clean up RoomIndex entries where all sessions are stale
    if (roomIndexSnapshot.exists()) {
      const allRooms = roomIndexSnapshot.val();
      
      for (const [roomId, roomData] of Object.entries(allRooms)) {
        const users = roomData as any;
        
        for (const [userId] of Object.entries(users)) {
          // Check if this user has any active sessions in Presence
          const userSessions = presenceSnapshot.child(userId).child("sessions").val();
          let hasActiveSession = false;
          
          if (userSessions) {
            for (const sessionData of Object.values(userSessions)) {
              const session = sessionData as any;
              if (session.roomId === roomId && typeof session.lastSeen === 'number' && 
                  (now - session.lastSeen) < STALE_THRESHOLD) {
                hasActiveSession = true;
                break;
              }
            }
          }
          
          // If no active sessions for this room, remove from RoomIndex
          if (!hasActiveSession) {
            cleanupPromises.push(
              admin.database().ref(`/RoomIndex/${roomId}/${userId}`).remove()
            );
          }
        }
      }
    }

    await Promise.all(cleanupPromises);

    // Clean up empty user nodes in Presence
    const updatedSnapshot = await presenceRef.once("value");
    if (updatedSnapshot.exists()) {
      const updatedUsers = updatedSnapshot.val();
      const userCleanupPromises: Promise<void>[] = [];

      for (const [userId, userData] of Object.entries(updatedUsers)) {
        const sessions = (userData as any).sessions;
        // If user has no sessions, remove the user node
        if (!sessions || Object.keys(sessions).length === 0) {
          userCleanupPromises.push(
            admin.database().ref(`/Presence/${userId}`).remove()
          );
        }
      }

      await Promise.all(userCleanupPromises);
    }

    // DISABLED FOR DEBUGGING - Don't touch EphemeralRooms
    /*
    // Also scan EphemeralRooms
    const ephemeralRoomsRef = admin.database().ref("/EphemeralRooms");
    const ephemeralRoomsSnapshot = await ephemeralRoomsRef.once("value");
    
    if (ephemeralRoomsSnapshot.exists()) {
      const ephemeralRooms = ephemeralRoomsSnapshot.val();
      const ephemeralCleanupPromises: Promise<void>[] = [];
      
      for (const [roomId, room] of Object.entries(ephemeralRooms)) {
        const roomData = room as any;
        if (!roomData.users) continue;
        
        // Check each user in the room
        for (const [userId] of Object.entries(roomData.users)) {
          // Check if user has an active presence session in this room
          const userSessions = presenceSnapshot.child(userId).child("sessions").val();
          let hasActiveSession = false;
          
          if (userSessions) {
            for (const sessionData of Object.values(userSessions)) {
              const session = sessionData as any;
              // Match by room URL since roomId in presence might be the URL
              const roomUrl = roomData.url || roomId;
              if ((session.roomId === roomUrl || session.roomId === `/${roomUrl}` || session.roomId === roomId) && 
                  typeof session.lastSeen === 'number' && 
                  (now - session.lastSeen) < STALE_THRESHOLD) {
                hasActiveSession = true;
                break;
              }
            }
          }
          
          // If no active session, remove user from ephemeral room
          if (!hasActiveSession) {
            ephemeralCleanupPromises.push(
              admin.database().ref(`/EphemeralRooms/${roomId}/users/${userId}`).remove()
            );
          }
        }
      }
      
      await Promise.all(ephemeralCleanupPromises);
      
      if (ephemeralCleanupPromises.length > 0) {
        console.log(`[cleanUpStalePresenceSessions] Cleaned up ${ephemeralCleanupPromises.length} stale ephemeral room users`);
      }
    }
    */

    console.log(`[cleanUpStalePresenceSessions] Cleaned up ${cleanupPromises.length} stale entries`);
  } catch (error) {
    console.error('[cleanUpStalePresenceSessions] Error:', error);
  }

  return null;
});
