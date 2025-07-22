import { rtdb } from "@/lib/firebase";
import { ref, push, set, get, remove, runTransaction, onDisconnect } from "firebase/database";
import type { PublicRoom, PublicRoomFromDB } from "@/app/types/publicRooms";

function generateRoomUrl(): string {
  const adjectives = ["swift", "bright", "calm", "bold", "cool", "fast", "kind", "warm", "zen"];
  const nouns = ["tiger", "eagle", "wolf", "bear", "fox", "lion", "hawk", "shark", "deer", "owl", "kiwi"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);
  return `${adjective}-${noun}-${number}`;
}

export async function createPublicRoom(userId: string, customUrl?: string): Promise<PublicRoom> {
  const publicRoomsRef = ref(rtdb, "PublicRooms");
  const newRoomRef = push(publicRoomsRef);
  const roomUrl = customUrl || generateRoomUrl();
  
  const newRoom: PublicRoomFromDB = {
    url: roomUrl,
    createdBy: userId,
    createdAt: Date.now(),
    userCount: 0 // Will be tracked by presence system
  };
  
  await set(newRoomRef, newRoom);
  
  const result = {
    id: newRoomRef.key!,
    ...newRoom
  };
  return result;
}

export async function getPublicRoomByUrl(url: string): Promise<PublicRoom | null> {
  const publicRoomsRef = ref(rtdb, "PublicRooms");
  const snapshot = await get(publicRoomsRef);
  
  if (!snapshot.exists()) {
    return null;
  }
  
  const rooms = snapshot.val();
  
  for (const [id, room] of Object.entries(rooms)) {
    const roomData = room as PublicRoomFromDB;
    if (roomData.url === url) {
      // Check if this room has any presence data
      const presenceRef = ref(rtdb, `PublicRoomPresence/${id}`);
      const presenceSnapshot = await get(presenceRef);
      
      if (!presenceSnapshot.exists()) {
        await deletePublicRoom(id);
        continue; // Check next room
      }
      
      const result = {
        id,
        ...roomData
      };
      return result;
    }
  }
  
  return null;
}

export async function getPublicRoomById(roomId: string): Promise<PublicRoom | null> {
  const roomRef = ref(rtdb, `PublicRooms/${roomId}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) return null;
  
  const roomData = snapshot.val() as PublicRoomFromDB;
  return {
    id: roomId,
    ...roomData
  };
}

export async function deletePublicRoom(roomId: string): Promise<void> {
  const roomRef = ref(rtdb, `PublicRooms/${roomId}`);
  await remove(roomRef);
}

export async function getAllPublicRooms(): Promise<PublicRoom[]> {
  const publicRoomsRef = ref(rtdb, "PublicRooms");
  const snapshot = await get(publicRoomsRef);
  
  if (!snapshot.exists()) return [];
  
  const rooms = snapshot.val();
  return Object.entries(rooms).map(([id, room]) => {
    const roomData = room as PublicRoomFromDB;
    return {
      id,
      ...roomData
    };
  });
}

export async function incrementUserCount(roomId: string): Promise<boolean> {
  const userCountRef = ref(rtdb, `PublicRooms/${roomId}/userCount`);
  
  try {
    let canJoin = false;
    
    await runTransaction(userCountRef, (currentCount) => {
      if (currentCount === null) {
        // Room doesn't exist
        canJoin = false;
        return; // Abort transaction
      }
      
      if (currentCount >= 5) {
        // Room is full
        canJoin = false;
        return; // Abort transaction
      }
      
      // Room has space, increment count
      canJoin = true;
      return currentCount + 1;
    });
    
    return canJoin;
  } catch (error) {
    console.error("Error incrementing user count:", error);
    return false;
  }
}

export async function decrementUserCount(roomId: string): Promise<void> {
  const userCountRef = ref(rtdb, `PublicRooms/${roomId}/userCount`);
  
  try {
    await runTransaction(userCountRef, (currentCount) => {
      if (currentCount === null || currentCount === undefined) {
        // Room doesn't exist
        return;
      }
      
      const newCount = Math.max(0, currentCount - 1);
      
      // Always return the new count, let Cloud Function handle deletion when it reaches 0
      return newCount;
    });
  } catch (error) {
    console.error("Error decrementing user count:", error);
  }
}

// Add user to public room
export async function addUserToPublicRoom(roomId: string, userId: string, displayName: string): Promise<void> {
  
  // Add user to users list
  const userRef = ref(rtdb, `PublicRooms/${roomId}/users/${userId}`);
  await set(userRef, { id: userId, displayName });
  
  // Set up onDisconnect to remove user when they disconnect
  await onDisconnect(userRef).remove();
  
  // Update the userCount based on actual users
  const roomRef = ref(rtdb, `PublicRooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    await set(ref(rtdb, `PublicRooms/${roomId}/userCount`), userCount);
  }
}

// Remove user from public room
export async function removeUserFromPublicRoom(roomId: string, userId: string): Promise<void> {
  
  // Remove user from users list
  const userRef = ref(rtdb, `PublicRooms/${roomId}/users/${userId}`);
  await remove(userRef);
  
  // Update the userCount based on actual users
  const roomRef = ref(rtdb, `PublicRooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    await set(ref(rtdb, `PublicRooms/${roomId}/userCount`), userCount);
    
    // If no users left, delete the room
    if (userCount === 0) {
      await deletePublicRoom(roomId);
      
      // Also clean up presence data
      const presenceRef = ref(rtdb, `PublicRoomPresence/${roomId}`);
      await remove(presenceRef);
    }
  }
}

export async function getAvailablePublicRoom(): Promise<PublicRoom | null> {
  const rooms = await getAllPublicRooms();
  
  // Import presence helper
  const { getPublicRoomUserCount } = await import('./publicRoomPresence');
  
  // Check each room's actual user count
  for (const room of rooms) {
    const activeCount = await getPublicRoomUserCount(room.id);
    if (activeCount < 5) {
      return room;
    }
  }
  
  return null;
}