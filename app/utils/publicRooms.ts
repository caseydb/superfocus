import { rtdb } from "@/lib/firebase";
import { ref, push, set, get, remove, runTransaction } from "firebase/database";
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
  console.log("[PUBLICROOMS] createPublicRoom called", { userId, customUrl });
  const publicRoomsRef = ref(rtdb, "PublicRooms");
  const newRoomRef = push(publicRoomsRef);
  const roomUrl = customUrl || generateRoomUrl();
  console.log("[PUBLICROOMS] Generated room URL:", roomUrl, "ID:", newRoomRef.key);
  
  const newRoom: PublicRoomFromDB = {
    url: roomUrl,
    createdBy: userId,
    createdAt: Date.now(),
    userCount: 0 // Will be tracked by presence system
  };
  
  console.log("[PUBLICROOMS] Writing to Firebase:", newRoom);
  await set(newRoomRef, newRoom);
  console.log("[PUBLICROOMS] Successfully written to Firebase");
  
  const result = {
    id: newRoomRef.key!,
    ...newRoom
  };
  console.log("[PUBLICROOMS] Returning:", result);
  return result;
}

export async function getPublicRoomByUrl(url: string): Promise<PublicRoom | null> {
  console.log("[PUBLICROOMS] getPublicRoomByUrl called with URL:", url);
  const publicRoomsRef = ref(rtdb, "PublicRooms");
  const snapshot = await get(publicRoomsRef);
  
  if (!snapshot.exists()) {
    console.log("[PUBLICROOMS] No PublicRooms exist in Firebase");
    return null;
  }
  
  const rooms = snapshot.val();
  console.log("[PUBLICROOMS] Found rooms in Firebase:", rooms);
  
  for (const [id, room] of Object.entries(rooms)) {
    const roomData = room as PublicRoomFromDB;
    console.log("[PUBLICROOMS] Checking room:", { id, url: roomData.url, against: url, match: roomData.url === url });
    if (roomData.url === url) {
      // Check if this room has any presence data
      const presenceRef = ref(rtdb, `PublicRoomPresence/${id}`);
      const presenceSnapshot = await get(presenceRef);
      
      if (!presenceSnapshot.exists()) {
        console.log("[PUBLICROOMS] Room found but has no presence data - it's orphaned, deleting it");
        await deletePublicRoom(id);
        continue; // Check next room
      }
      
      const result = {
        id,
        ...roomData
      };
      console.log("[PUBLICROOMS] Found matching room with active presence:", result);
      return result;
    }
  }
  
  console.log("[PUBLICROOMS] No matching room found for URL:", url);
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
  const roomRef = ref(rtdb, `PublicRooms/${roomId}`);
  
  try {
    await runTransaction(roomRef, (currentData) => {
      if (!currentData) {
        // Room doesn't exist
        return;
      }
      
      const newCount = currentData.userCount - 1;
      
      if (newCount <= 0) {
        // Remove the entire room when last user leaves
        return null;
      } else {
        // Just update the count
        return {
          ...currentData,
          userCount: newCount
        };
      }
    });
  } catch (error) {
    console.error("Error decrementing user count:", error);
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