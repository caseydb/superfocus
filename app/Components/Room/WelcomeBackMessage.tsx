"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, get } from "firebase/database";

interface WelcomeBackMessageProps {
  roomId: string;
}

export default function WelcomeBackMessage({ roomId }: WelcomeBackMessageProps) {
  const { user } = useInstance();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");

  const [inspirationalQuote, setInspirationalQuote] = useState("");

  // Inspirational quotes for focus and productivity
  const getInspirationalQuote = () => {
    const quotes = [
      "Focus is your superpower",
      "Progress over perfection",
      "Small steps, big results",
      "Your future self will thank you",
      "Success is built one task at a time",
      "Focus on what matters most",
      "Make today count",
    ];

    return quotes[Math.floor(Math.random() * quotes.length)];
  };

  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (!showWelcome) return;

    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showWelcome]);

  // Handle Enter key to dismiss welcome message immediately
  useEffect(() => {
    if (!showWelcome) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        setShowWelcome(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showWelcome]);

  useEffect(() => {
    if (!user?.id || !roomId) return;

    const checkWelcomeBack = async () => {
      try {
        // Check user's last visit to this room
        const lastVisitRef = ref(rtdb, `users/${user.id}/lastVisits/${roomId}`);
        const lastVisitSnapshot = await get(lastVisitRef);
        const lastVisit = lastVisitSnapshot.val();

        const now = Date.now();
        const firstName = user.displayName.split(" ")[0];

        // Show welcome message EVERY time user enters the room!
        if (lastVisit) {
          // Returning user - show simple welcome back message
          setWelcomeMessage(`Welcome back, ${firstName}!`);
          setShowWelcome(true);
        } else {
          // First time in this room
          setWelcomeMessage(`Welcome, ${firstName}!`);
          setShowWelcome(true);
        }

        // Set inspirational quote
        setInspirationalQuote(getInspirationalQuote());

        // Update last visit timestamp
        set(lastVisitRef, now);
      } catch (error) {
        console.error("Error checking welcome back status:", error);
      }
    };

    // Check immediately - no delay needed
    checkWelcomeBack();
  }, [user?.id, roomId]);

  if (!showWelcome) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-none">
      {/* Compact message container */}
      <div className="bg-gradient-to-r from-gray-900/90 via-black/90 to-gray-900/90 rounded-xl shadow-lg border-2 border-[#FFAA00] px-6 py-3 animate-in slide-in-from-top duration-500">
        {/* Subtle glowing border effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FFAA00]/10 via-[#FFAA00]/20 to-[#FFAA00]/10 blur-lg -z-10" />

        {/* Content */}
        <div className="text-center space-y-2">
          {/* Welcome message */}
          <div className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-yellow-300 to-[#FFAA00]">
            {welcomeMessage}
          </div>

          {/* Inspirational quote */}
          <div className="text-sm text-gray-300 font-light italic opacity-80">{inspirationalQuote}</div>
        </div>
      </div>
    </div>
  );
}
