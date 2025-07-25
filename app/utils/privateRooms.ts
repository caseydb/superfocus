import { rtdb } from "@/lib/firebase";
import { ref, set, get, remove, push, onDisconnect } from "firebase/database";
import type { PrivateRoom, PrivateRoomFromDB } from "../types/privateRooms";
import { auth } from "@/lib/firebase";

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
  
  try {
    // Check if URL is already taken in Firebase RTDB
    const urlTaken = await isPrivateRoomUrlTaken(customUrl);
    if (urlTaken) {
      throw new Error("Room URL already taken");
    }
    
    // Sync with PostgreSQL database
    let pgRoomId: string | undefined;
    try {
      // Get the current user's ID token
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not authenticated");
      }
      const idToken = await user.getIdToken();
      
      // Call the API to create room in PostgreSQL
      const response = await fetch("/api/private-room-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ roomSlug: customUrl }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create room in database");
      }
      
      const result = await response.json();
      pgRoomId = result.room.id;
      console.log("PostgreSQL room created:", pgRoomId);
    } catch (error) {
      console.error("Error syncing room to PostgreSQL:", error);
      // Continue without PostgreSQL sync - room will still work in Firebase
    }
    
    // Create room in Firebase RTDB
    const privateRoomsRef = ref(rtdb, "PrivateRooms");
    const newRoomRef = push(privateRoomsRef);
    const roomId = newRoomRef.key!;
    
    const roomData: PrivateRoomFromDB = {
      url: customUrl,
      createdBy: userId,
      createdAt: Date.now(),
      userCount: 0,
      users: {},
      ...(pgRoomId && { pgRoomId }) // Only include if PostgreSQL sync succeeded
    };
    
    await set(newRoomRef, roomData);
    console.log("Firebase RTDB room created:", roomId);
    
    return {
      id: roomId,
      ...roomData
    };
  } catch (error) {
    console.error("Error creating private room:", error);
    throw error;
  }
}

// Get a private room by URL
export async function getPrivateRoomByUrl(url: string): Promise<PrivateRoom | null> {
  
  const privateRoomsRef = ref(rtdb, "PrivateRooms");
  const snapshot = await get(privateRoomsRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const rooms = snapshot.val();
  for (const roomId in rooms) {
    if (rooms[roomId].url === url) {
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
  }
}

// Remove user from private room
export async function removeUserFromPrivateRoom(roomId: string, userId: string): Promise<void> {
  
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
  }
}

// Delete a private room (only by creator)
export async function deletePrivateRoom(roomId: string, userId: string): Promise<void> {
  
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
}

