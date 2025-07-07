"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, get } from "firebase/database";

interface WelcomeBackMessageProps {
  roomId: string;
  onVisibilityChange?: (isVisible: boolean) => void;
}

export default function WelcomeBackMessage({ roomId, onVisibilityChange }: WelcomeBackMessageProps) {
  const { user } = useInstance();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [inspirationalQuote, setInspirationalQuote] = useState("");

  // Inspirational quotes for focus and productivity
  const getInspirationalQuote = () => {
    const quotes = [
      "Focus is your superpower",
      "Progress over perfection",
      "Small steps, big results",
      "Your future self will thank you",
      "Discipline creates freedom",
      "Excellence is a daily practice",
      "Success is built one task at a time",
      "Focus on what matters most",
      "Make today count",
      "Your effort shapes your outcome",
    ];

    return quotes[Math.floor(Math.random() * quotes.length)];
  };

  // Separate countdown effect that runs when showWelcome becomes true
  useEffect(() => {
    if (!showWelcome) return;

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setShowWelcome(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [showWelcome]);

  // Notify parent component when visibility changes
  useEffect(() => {
    onVisibilityChange?.(showWelcome);
  }, [showWelcome, onVisibilityChange]);

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
          setIsReturningUser(true);
          setWelcomeMessage(`Welcome back, ${firstName}!`);
          setCountdown(3);
          setShowWelcome(true);
        } else {
          // First time in this room
          setIsReturningUser(false);
          setWelcomeMessage(`Welcome, ${firstName}!`);
          setCountdown(3);
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
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
      {/* Epic background effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-900/20 via-blue-900/20 to-purple-900/20 animate-pulse" />
      <div className="absolute inset-0 bg-black/30" />

      {/* Animated rings - smooth pulsing */}
      <div
        className="absolute w-96 h-96 border-4 border-[#FFAA00]/30 rounded-full animate-pulse"
        style={{
          animation: "smooth-pulse 3s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-80 h-80 border-4 border-[#FFAA00]/50 rounded-full animate-pulse"
        style={{
          animation: "smooth-pulse 3s ease-in-out infinite 0.5s",
        }}
      />
      <div
        className="absolute w-64 h-64 border-4 border-[#FFAA00]/70 rounded-full animate-pulse"
        style={{
          animation: "smooth-pulse 3s ease-in-out infinite 1s",
        }}
      />

      {/* Main message container */}
      <div className="relative z-10 bg-gradient-to-r from-gray-900/95 via-black/95 to-gray-900/95 rounded-3xl shadow-2xl border-4 border-[#FFAA00] p-8 max-w-4xl mx-4 animate-in zoom-in duration-700">
        {/* Glowing border effect */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#FFAA00]/20 via-[#FFAA00]/40 to-[#FFAA00]/20 blur-xl -z-10" />

        {/* Content */}
        <div className="text-center space-y-6">
          {/* Welcome message */}
          <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-yellow-300 to-[#FFAA00] animate-pulse leading-tight">
            {welcomeMessage}
          </div>

          {/* Inspirational quote */}
          <div className="text-lg sm:text-xl text-gray-300 font-light italic opacity-80 animate-in slide-in-from-bottom duration-1000 delay-300">
            {inspirationalQuote}
          </div>

          {/* Countdown */}
          <div className="text-base text-gray-400 font-mono opacity-70 animate-in slide-in-from-bottom duration-1000 delay-500">
            {isReturningUser ? `The grind continues in ${countdown}` : `The grind starts in ${countdown}`}
          </div>

          {/* Subtle continue hint */}
          <div className="text-sm text-gray-500 font-mono opacity-60 animate-in fade-in duration-1000 delay-1000">
            Press Enter to continue
          </div>
        </div>
      </div>
    </div>
  );
}
