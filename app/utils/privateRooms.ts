import { rtdb } from "@/lib/firebase";
import { ref, set, get, remove, push, onDisconnect } from "firebase/database";
import type { PrivateRoom, PrivateRoomFromDB } from "../types/privateRooms";

// Check if a private room URL is already taken
export async function isPrivateRoomUrlTaken(url: string): Promise<boolean> {
  const privateRoomsRef = ref(rtdb, "PrivateRooms");
  const snapshot = await get(privateRoomsRef);
  
  if (!snapshot.exists()) return false;
  
  const rooms = snapshot.val();
  for (const roomId in rooms) {
    if (rooms[roomId].url === url) {
      return true;
    }
  }
  
  return false;
}

// Create a new private room with custom URL
export async function createPrivateRoom(userId: string, customUrl: string): Promise<PrivateRoom> {
  console.log("[PRIVATE_ROOMS] Creating private room:", { userId, customUrl });
  
  // Check if URL is already taken
  const urlTaken = await isPrivateRoomUrlTaken(customUrl);
  if (urlTaken) {
    throw new Error("Room URL already taken");
  }
  
  const privateRoomsRef = ref(rtdb, "PrivateRooms");
  const newRoomRef = push(privateRoomsRef);
  const roomId = newRoomRef.key!;
  
  const roomData: PrivateRoomFromDB = {
    url: customUrl,
    createdBy: userId,
    createdAt: Date.now(),
    userCount: 0,
    users: {}
  };
  
  await set(newRoomRef, roomData);
  console.log("[PRIVATE_ROOMS] Private room created:", roomId);
  
  return {
    id: roomId,
    ...roomData
  };
}

// Get a private room by URL
export async function getPrivateRoomByUrl(url: string): Promise<PrivateRoom | null> {
  console.log("[PRIVATE_ROOMS] Getting private room by URL:", url);
  
  const privateRoomsRef = ref(rtdb, "PrivateRooms");
  const snapshot = await get(privateRoomsRef);
  
  if (!snapshot.exists()) {
    console.log("[PRIVATE_ROOMS] No private rooms found");
    return null;
  }
  
  const rooms = snapshot.val();
  for (const roomId in rooms) {
    if (rooms[roomId].url === url) {
      console.log("[PRIVATE_ROOMS] Found private room:", roomId);
      const room = rooms[roomId];
      
      // Calculate actual user count from users object
      const actualUserCount = room.users ? Object.keys(room.users).length : 0;
      
      return {
        id: roomId,
        ...room,
        userCount: actualUserCount
      };
    }
  }
  
  console.log("[PRIVATE_ROOMS] Private room not found for URL:", url);
  return null;
}

// Get a private room by ID
export async function getPrivateRoomById(roomId: string): Promise<PrivateRoom | null> {
  const roomRef = ref(rtdb, `PrivateRooms/${roomId}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const room = snapshot.val();
  
  // Calculate actual user count from users object
  const actualUserCount = room.users ? Object.keys(room.users).length : 0;
  
  return {
    id: roomId,
    ...room,
    userCount: actualUserCount
  };
}

// Add user to private room
export async function addUserToPrivateRoom(roomId: string, userId: string, displayName: string): Promise<void> {
  console.log("[PRIVATE_ROOMS] Adding user to room:", { roomId, userId, displayName });
  
  // Add user to users list
  const userRef = ref(rtdb, `PrivateRooms/${roomId}/users/${userId}`);
  await set(userRef, { id: userId, displayName });
  
  // Set up onDisconnect to remove user when they disconnect
  await onDisconnect(userRef).remove();
  
  // Update the userCount based on actual users
  const roomRef = ref(rtdb, `PrivateRooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    await set(ref(rtdb, `PrivateRooms/${roomId}/userCount`), userCount);
    console.log("[PRIVATE_ROOMS] Updated user count to:", userCount);
  }
}

// Remove user from private room
export async function removeUserFromPrivateRoom(roomId: string, userId: string): Promise<void> {
  console.log("[PRIVATE_ROOMS] Removing user from room:", { roomId, userId });
  
  // Remove user from users list
  const userRef = ref(rtdb, `PrivateRooms/${roomId}/users/${userId}`);
  await remove(userRef);
  
  // Update the userCount based on actual users
  const roomRef = ref(rtdb, `PrivateRooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    await set(ref(rtdb, `PrivateRooms/${roomId}/userCount`), userCount);
    console.log("[PRIVATE_ROOMS] Updated user count to:", userCount);
  }
}

// Delete a private room (only by creator)
export async function deletePrivateRoom(roomId: string, userId: string): Promise<void> {
  console.log("[PRIVATE_ROOMS] Attempting to delete room:", { roomId, userId });
  
  // Check if user is the creator
  const room = await getPrivateRoomById(roomId);
  if (!room) {
    throw new Error("Room not found");
  }
  
  if (room.createdBy !== userId) {
    throw new Error("Only the creator can delete this room");
  }
  
  // Delete the room
  const roomRef = ref(rtdb, `PrivateRooms/${roomId}`);
  await remove(roomRef);
  
  console.log("[PRIVATE_ROOMS] Private room deleted:", roomId);
}

