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
      console.log("🚀 Creating new public room for user:", userId);
      
      // Use the same createPublicRoom function that createInstance uses
      const publicRoom = await createPublicRoom(userId);
      console.log("✅ Room created:", publicRoom);
      
      // Navigate directly to the new room
      // Using window.location to force a full navigation
      const roomUrl = `/${publicRoom.url}`;
      console.log("🚪 Navigating to:", roomUrl);
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
      console.log("🏗️ Starting ephemeral room creation for user:", userId);
      
      // Generate a unique room URL
      const roomUrl = this.generateRoomUrl();
      console.log("🎲 Generated room URL:", roomUrl);
      
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
      console.log("📝 Room data to be saved (with initial user):", roomData);
      
      // Push to Firebase EphemeralRooms
      const ephemeralRoomsRef = ref(rtdb, 'EphemeralRooms');
      const newRoomRef = push(ephemeralRoomsRef);
      console.log("🔑 Firebase reference key:", newRoomRef.key);
      
      await set(newRoomRef, roomData);
      console.log("✅ Room saved to Firebase EphemeralRooms with initial user");
      
      // Verify the room was created
      const verifyRef = ref(rtdb, `EphemeralRooms/${newRoomRef.key}`);
      const snapshot = await get(verifyRef);
      if (snapshot.exists()) {
        console.log("✅ Room verified in Firebase:", snapshot.val());
      } else {
        console.error("❌ Room NOT found in Firebase after creation!");
      }
      
      const room: EphemeralRoom = {
        id: newRoomRef.key!,
        ...roomData,
        type: "public" as const
      };
      
      console.log("🎉 Room creation complete:", room);
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
      console.log("🔍 Starting GSD presence check...");
      
      // First, find the GSD room's Firebase ID
      const publicRoomsRef = ref(rtdb, 'PublicRooms');
      const roomsSnapshot = await get(publicRoomsRef);
      let gsdFirebaseId: string | null = null;
      
      if (roomsSnapshot.exists()) {
        const roomsData = roomsSnapshot.val();
        console.log("📂 PublicRooms data:", roomsData);
        
        for (const [roomId, roomData] of Object.entries(roomsData)) {
          const room = roomData as { url?: string, name?: string };
          console.log(`  Checking room ${roomId}: url="${room.url}", name="${room.name}"`);
          if (room.url === "gsd") {
            gsdFirebaseId = roomId;
            console.log(`✅ Found GSD room in PublicRooms with ID: ${gsdFirebaseId}`);
            break;
          }
        }
      }
      
      // Also check EphemeralRooms for GSD
      if (!gsdFirebaseId) {
        console.log("🔍 GSD not found in PublicRooms, checking EphemeralRooms...");
        const ephemeralRoomsRef = ref(rtdb, 'EphemeralRooms');
        const ephemeralSnapshot = await get(ephemeralRoomsRef);
        
        if (ephemeralSnapshot.exists()) {
          const ephemeralData = ephemeralSnapshot.val();
          console.log("📂 EphemeralRooms data:", ephemeralData);
          
          for (const [roomId, roomData] of Object.entries(ephemeralData)) {
            const room = roomData as { url?: string, name?: string };
            console.log(`  Checking room ${roomId}: url="${room.url}", name="${room.name}"`);
            if (room.url === "gsd") {
              gsdFirebaseId = roomId;
              console.log(`✅ Found GSD room in EphemeralRooms with ID: ${gsdFirebaseId}`);
              break;
            }
          }
        }
      }
      
      if (!gsdFirebaseId) {
        console.log("❌ GSD room doesn't exist in Firebase");
        return false;
      }
      
      // Check Presence for anyone in the GSD room
      console.log(`🔍 Checking Presence for room ID: ${gsdFirebaseId}`);
      const presenceRef = ref(rtdb, 'Presence');
      const presenceSnapshot = await get(presenceRef);
      
      if (presenceSnapshot.exists()) {
        const presenceData = presenceSnapshot.val();
        console.log("👥 Presence data:", presenceData);
        
        let userCount = 0;
        for (const [userId, userData] of Object.entries(presenceData)) {
          const userSessions = (userData as { sessions?: Record<string, unknown> }).sessions;
          if (!userSessions) {
            console.log(`  User ${userId}: No sessions`);
            continue;
          }
          
          console.log(`  User ${userId} sessions:`, userSessions);
          
          for (const [sessionId, sessionData] of Object.entries(userSessions)) {
            const session = sessionData as { roomId?: string };
            console.log(`    Session ${sessionId}: roomId="${session.roomId}"`);
            if (session.roomId === gsdFirebaseId) {
              userCount++;
              console.log(`    ✅ Found user in GSD! Total count: ${userCount}`);
            }
          }
        }
        
        console.log(`📊 Final GSD presence count: ${userCount} users`);
        return userCount > 0;
      } else {
        console.log("❌ No presence data exists");
      }
      
      console.log("📊 Final result: No one in GSD");
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
      console.log("🚀 Quick Join started for user:", userId);
      const gsdHasPresence = await this.checkGSDPresence();
      
      if (!gsdHasPresence) {
        console.log("✅ GSD is empty - joining GSD room");
        return "gsd";
      } else {
        console.log("👥 GSD has people - creating new ephemeral room");
        const { url } = await this.createEphemeralRoom(userId);
        console.log(`🆕 Created new ephemeral room: ${url}`);
        return url;
      }
    } catch (error) {
      console.error("❌ Error in quickJoin:", error);
      // Fallback: create a new ephemeral room
      console.log("⚠️ Fallback: Creating new ephemeral room due to error");
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