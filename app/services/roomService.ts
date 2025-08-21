import { rtdb } from "@/lib/firebase";
import { ref, push, set, get } from "firebase/database";
import { createPublicRoom } from "@/app/utils/publicRooms";

export interface EphemeralRoom {
  id: string;
  url: string;
  name: string;
  type: "public";
  createdAt: number;
  createdBy: string;
  userCount: number;
}

class RoomService {
  /**
   * Creates a new public room and navigates to it
   * This replicates the exact logic of createInstance("public") but can be called from anywhere
   * @param userId - The ID of the user creating the room
   */
  async createRoomAndNavigate(userId: string): Promise<void> {
    try {
      
      // Use the same createPublicRoom function that createInstance uses
      const publicRoom = await createPublicRoom(userId);
      
      // Navigate directly to the new room
      // Using window.location to force a full navigation
      const roomUrl = `/${publicRoom.url}`;
      window.location.href = roomUrl;
    } catch (error) {
      console.error("❌ Error creating room:", error);
      throw error;
    }
  }
  /**
   * Creates a new ephemeral room in Firebase
   * @param userId - The ID of the user creating the room
   * @returns The created room data and URL
   */
  async createEphemeralRoom(userId: string): Promise<{ room: EphemeralRoom; url: string }> {
    try {
      
      // Generate a unique room URL
      const roomUrl = this.generateRoomUrl();
      
      // Create room data with initial user to prevent deletion
      const roomData = {
        url: roomUrl,
        name: `Room ${roomUrl}`,
        type: "public",
        createdAt: Date.now(),
        createdBy: userId,
        userCount: 1,
        // Add the creator as the first user so room isn't empty
        users: {
          [userId]: {
            id: userId,
            displayName: userId,
            joinedAt: Date.now()
          }
        }
      };
      
      // Push to Firebase EphemeralRooms
      const ephemeralRoomsRef = ref(rtdb, 'EphemeralRooms');
      const newRoomRef = push(ephemeralRoomsRef);
      
      await set(newRoomRef, roomData);
      
      // Verify the room was created
      const verifyRef = ref(rtdb, `EphemeralRooms/${newRoomRef.key}`);
      const snapshot = await get(verifyRef);
      if (snapshot.exists()) {
      } else {
        console.error("❌ Room NOT found in Firebase after creation!");
      }
      
      const room: EphemeralRoom = {
        id: newRoomRef.key!,
        ...roomData,
        type: "public" as const
      };
      
      return { room, url: roomUrl };
    } catch (error) {
      console.error("❌ Error creating ephemeral room:", error);
      throw error;
    }
  }
  
  /**
   * Checks if the GSD room has any presence
   * @returns true if someone is in the GSD room, false otherwise
   */
  async checkGSDPresence(): Promise<boolean> {
    try {
      
      // First, find the GSD room's Firebase ID
      const publicRoomsRef = ref(rtdb, 'PublicRooms');
      const roomsSnapshot = await get(publicRoomsRef);
      let gsdFirebaseId: string | null = null;
      
      if (roomsSnapshot.exists()) {
        const roomsData = roomsSnapshot.val();
        
        for (const [roomId, roomData] of Object.entries(roomsData)) {
          const room = roomData as { url?: string, name?: string };
          if (room.url === "gsd") {
            gsdFirebaseId = roomId;
            break;
          }
        }
      }
      
      // Also check EphemeralRooms for GSD
      if (!gsdFirebaseId) {
        const ephemeralRoomsRef = ref(rtdb, 'EphemeralRooms');
        const ephemeralSnapshot = await get(ephemeralRoomsRef);
        
        if (ephemeralSnapshot.exists()) {
          const ephemeralData = ephemeralSnapshot.val();
          
          for (const [roomId, roomData] of Object.entries(ephemeralData)) {
            const room = roomData as { url?: string, name?: string };
            if (room.url === "gsd") {
              gsdFirebaseId = roomId;
              break;
            }
          }
        }
      }
      
      if (!gsdFirebaseId) {
        return false;
      }
      
      // Check Presence for anyone in the GSD room
      const presenceRef = ref(rtdb, 'Presence');
      const presenceSnapshot = await get(presenceRef);
      
      if (presenceSnapshot.exists()) {
        const presenceData = presenceSnapshot.val();
        
        let userCount = 0;
        for (const userData of Object.values(presenceData)) {
          const userSessions = (userData as { sessions?: Record<string, unknown> }).sessions;
          if (!userSessions) {
            continue;
          }
          
          
          for (const sessionData of Object.values(userSessions)) {
            const session = sessionData as { roomId?: string };
            if (session.roomId === gsdFirebaseId) {
              userCount++;
            }
          }
        }
        
        return userCount > 10;
      } else {
      }
      
      return false;
    } catch (error) {
      console.error("❌ Error checking GSD presence:", error);
      return false;
    }
  }
  
  /**
   * Handles Quick Join logic - either joins GSD or creates ephemeral room
   * @param userId - The ID of the user joining
   * @returns The room URL to navigate to
   */
  async quickJoin(userId: string): Promise<string> {
    try {
      const gsdHasPresence = await this.checkGSDPresence();
      
      if (!gsdHasPresence) {
        return "gsd";
      } else {
        const { url } = await this.createEphemeralRoom(userId);
        return url;
      }
    } catch (error) {
      console.error("❌ Error in quickJoin:", error);
      // Fallback: create a new ephemeral room
      const { url } = await this.createEphemeralRoom(userId);
      return url;
    }
  }
  
  /**
   * Generates a random room URL
   */
  private generateRoomUrl(): string {
    const adjectives = ['swift', 'bright', 'calm', 'bold', 'keen', 'wise', 'pure', 'fair'];
    const nouns = ['wolf', 'hawk', 'bear', 'lynx', 'fox', 'oak', 'pine', 'sage'];
    
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(Math.random() * 100);
    
    return `${randomAdjective}-${randomNoun}-${randomNumber}`;
  }
}

// Export singleton instance
export const roomService = new RoomService();