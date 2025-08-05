"use client";

import { useState } from "react";
import { useInstance } from "../Components/Instances";
import { roomService } from "../services/roomService";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";

export function useQuickJoin() {
  const { createInstance } = useInstance();
  const [isJoining, setIsJoining] = useState(false);
  const user = useSelector((state: RootState) => state.user);

  const quickJoin = async () => {
    setIsJoining(true);
    
    try {
      const userId = user?.user_id || 'anonymous';
      const roomUrl = await roomService.quickJoin(userId);
      
      if (roomUrl === "gsd") {
        // GSD is empty, navigate there
        window.location.href = '/gsd';
      } else {
        // GSD has people, create instance normally (for Lobby)
        // This maintains compatibility with the existing Lobby flow
        createInstance("public");
      }
    } catch (error) {
      console.error("Error in quickJoin:", error);
      // Fallback to creating a new room
      createInstance("public");
    } finally {
      setIsJoining(false);
    }
  };

  return { quickJoin, isJoining };
}