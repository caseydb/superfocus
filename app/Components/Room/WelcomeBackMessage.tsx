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

  // Auto-hide timer - hides welcome message after 5 seconds
  useEffect(() => {
    if (!showWelcome) return;

    const timeout = setTimeout(() => {
      setShowWelcome(false);
    }, 5000);

    return () => clearTimeout(timeout);
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
      } catch {
        // Silent error handling - error details not needed
      }
    };

    // Check immediately - no delay needed
    checkWelcomeBack();
  }, [user?.id, user?.displayName, roomId]);

  if (!showWelcome) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
      {/* Compact message container pinned to top with fade out to sides */}
      <div className="relative overflow-hidden animate-in slide-in-from-top duration-500">
        {/* Background with fade effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/95 to-transparent" />
        
        {/* Border with fade effect */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#FFAA00] to-transparent" />
        
        {/* Subtle glow effect in center */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFAA00]/10 to-transparent blur-xl" />

        {/* Content */}
        <div className="relative text-center space-y-1 py-3 px-6">
          {/* Welcome message */}
          <div className="text-lg sm:text-xl font-bold text-[#FFAA00]">
            {welcomeMessage}
          </div>

          {/* Inspirational quote */}
          <div className="text-sm text-gray-300 font-light italic opacity-80">{inspirationalQuote}</div>
        </div>
      </div>
    </div>
  );
}
