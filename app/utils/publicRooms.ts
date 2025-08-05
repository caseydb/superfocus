import { rtdb } from "@/lib/firebase";
import { ref, push, set, get, remove, runTransaction, update } from "firebase/database";
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
  const ephemeralRoomsRef = ref(rtdb, "EphemeralRooms");
  const newRoomRef = push(ephemeralRoomsRef);
  const roomUrl = customUrl || generateRoomUrl();
  
  // Format the room name from URL (e.g., "calm-eagle-9" → "Calm Eagle 9")
  const roomName = roomUrl
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  const newRoom: PublicRoomFromDB = {
    url: roomUrl,
    name: roomName,
    createdBy: userId,
    createdAt: Date.now(),
    userCount: 0
  };
  
  await set(newRoomRef, newRoom);
  
  const result = {
    id: newRoomRef.key!,
    ...newRoom
  };
  return result;
}

export async function getPublicRoomByUrl(url: string): Promise<PublicRoom | null> {
  const ephemeralRoomsRef = ref(rtdb, "EphemeralRooms");
  const snapshot = await get(ephemeralRoomsRef);
  
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
  const roomRef = ref(rtdb, `EphemeralRooms/${roomId}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) return null;
  
  const roomData = snapshot.val() as PublicRoomFromDB;
  return {
    id: roomId,
    ...roomData
  };
}

export async function deletePublicRoom(roomId: string): Promise<void> {
  const roomRef = ref(rtdb, `EphemeralRooms/${roomId}`);
  await remove(roomRef);
}

export async function getAllPublicRooms(): Promise<PublicRoom[]> {
  const ephemeralRoomsRef = ref(rtdb, "EphemeralRooms");
  const snapshot = await get(ephemeralRoomsRef);
  
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
  const userCountRef = ref(rtdb, `EphemeralRooms/${roomId}/userCount`);
  
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
  } catch {
    return false;
  }
}

export async function decrementUserCount(roomId: string): Promise<void> {
  const userCountRef = ref(rtdb, `EphemeralRooms/${roomId}/userCount`);
  
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
  } catch {
    // Silent error handling - error details not needed
  }
}

// Add user to public room
export async function addUserToPublicRoom(roomId: string, userId: string, displayName: string): Promise<void> {
  // Just add the user, nothing else
  const userRef = ref(rtdb, `EphemeralRooms/${roomId}/users/${userId}`);
  await set(userRef, { id: userId, displayName });
  
  // Update userCount
  const roomRef = ref(rtdb, `EphemeralRooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    const room = snapshot.val();
    const userCount = room.users ? Object.keys(room.users).length : 0;
    await update(roomRef, { userCount });
  }
}

// Remove user from public room
export async function removeUserFromPublicRoom(roomId: string, userId: string): Promise<void> {
  // Just remove the user
  const userRef = ref(rtdb, `EphemeralRooms/${roomId}/users/${userId}`);
  await remove(userRef);
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