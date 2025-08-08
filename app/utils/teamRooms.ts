import { rtdb } from "@/lib/firebase";
import { ref, set, get, push } from "firebase/database";
import type { PrivateRoom, PrivateRoomFromDB } from "../types/privateRooms";
import { auth } from "@/lib/firebase";

// Check if a team room URL is already taken
export async function isTeamRoomUrlTaken(url: string): Promise<boolean> {
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

// Create a new team room (always private type)
export async function createTeamRoom(userId: string, customUrl: string, roomName?: string): Promise<PrivateRoom> {
  
  console.log("[teamRooms] Starting team room creation...");
  console.log("[teamRooms] userId:", userId, "customUrl:", customUrl, "roomName:", roomName);
  
  try {
    // Check if URL is already taken in Firebase RTDB
    console.log("[teamRooms] Checking if URL is taken in Firebase RTDB...");
    const urlTaken = await isTeamRoomUrlTaken(customUrl);
    if (urlTaken) {
      console.error("[teamRooms] URL already taken:", customUrl);
      throw new Error("Room URL already taken");
    }
    
    // Sync with PostgreSQL database
    let pgRoomId: string | undefined;
    try {
      // Get the current user's ID token
      const user = auth.currentUser;
      console.log("[teamRooms] Current Firebase user:", user?.uid, user?.email);
      if (!user) {
        console.error("[teamRooms] No authenticated user found");
        throw new Error("User not authenticated");
      }
      const idToken = await user.getIdToken();
      console.log("[teamRooms] Got ID token, calling API...");
      
      // Call the API to create team room in PostgreSQL with type='private'
      const response = await fetch("/api/team-room-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ 
          roomSlug: customUrl,
          roomName: roomName || customUrl // Use provided name or fall back to slug
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create team room in database");
      }
      
      const result = await response.json();
      console.log("[teamRooms] API response:", result);
      pgRoomId = result.room.id;
      console.log("[teamRooms] PostgreSQL team room created with ID:", pgRoomId);
      console.log("[teamRooms] Full room data from API:", result.room);
    } catch (error) {
      console.error("[teamRooms] Error syncing team room to PostgreSQL:", error);
      if (error instanceof Error) {
        console.error("[teamRooms] Error message:", error.message);
        console.error("[teamRooms] Error stack:", error.stack);
      }
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
    
    // Update PostgreSQL with the Firebase ID if we have a pgRoomId
    if (pgRoomId) {
      try {
        const user = auth.currentUser;
        if (user) {
          const idToken = await user.getIdToken();
          
          await fetch("/api/update-room-firebase-id", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              roomId: pgRoomId,
              firebaseId: roomId
            }),
          });
          
          // Room successfully linked
        }
      } catch (error) {
        console.error("Error updating PostgreSQL with Firebase ID:", error);
        // Continue - room is created, just missing the link
      }
    }
    
    return {
      id: roomId,
      ...roomData
    };
  } catch (error) {
    console.error("Error creating team room:", error);
    throw error;
  }
}