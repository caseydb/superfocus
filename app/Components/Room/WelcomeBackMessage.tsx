"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useSelector } from "react-redux";
import { RootState } from "../../store/store";

interface WelcomeBackMessageProps {
  roomId: string;
}

export default function WelcomeBackMessage({ roomId }: WelcomeBackMessageProps) {
  const { } = useInstance();
  const reduxUser = useSelector((state: RootState) => state.user);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [inspirationalQuote, setInspirationalQuote] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);
  const [cachedName, setCachedName] = useState<string | null>(null);

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

  // Load cached name on mount
  useEffect(() => {
    const cached = localStorage.getItem('locked_in_user_name');
    if (cached) {
      setCachedName(cached);
    }
  }, []);

  // Cache the user's name when it becomes available from Redux
  useEffect(() => {
    if (!reduxUser.isGuest && reduxUser.first_name && reduxUser.first_name !== 'Guest') {
      const firstName = reduxUser.first_name;
      localStorage.setItem('locked_in_user_name', firstName);
      setCachedName(firstName);
    }
  }, [reduxUser.first_name, reduxUser.isGuest]);

  // Show welcome message immediately with or without name
  useEffect(() => {
    // Check welcome status for all users (guests and authenticated)
    if (!roomId || hasProcessed) return;

    const checkWelcomeBack = () => {
      try {
        // Mark as processed immediately to prevent re-runs
        setHasProcessed(true);

        // Check localStorage for returning user flag (device-specific)
        const localStorageKey = 'locked_in_returning_user';
        const isReturningUser = localStorage.getItem(localStorageKey) === 'true';

        // Build welcome message with or without name
        let message;
        if (!isReturningUser) {
          // First time on this device
          // For guest users, never show name
          message = (reduxUser.isGuest || !cachedName) ? "Welcome!" : `Welcome, ${cachedName}!`;
          // Mark as returning user for next time
          localStorage.setItem(localStorageKey, 'true');
        } else {
          // Returning user on this device
          // For guest users, never show name
          message = (reduxUser.isGuest || !cachedName) ? "Welcome back!" : `Welcome back, ${cachedName}!`;
        }
        
        setWelcomeMessage(message);
        setShowWelcome(true);

        // Set inspirational quote
        setInspirationalQuote(getInspirationalQuote());
      } catch {
        // Silent error handling - error details not needed
      }
    };

    // Check immediately - no delay needed
    checkWelcomeBack();
  }, [roomId, hasProcessed, cachedName, reduxUser.isGuest]);

  // Update welcome message when name becomes available
  useEffect(() => {
    if (showWelcome && cachedName && !welcomeMessage.includes(cachedName)) {
      // Update the message to include the name
      const isReturningUser = localStorage.getItem('locked_in_returning_user') === 'true';
      const newMessage = isReturningUser ? `Welcome back, ${cachedName}!` : `Welcome, ${cachedName}!`;
      setWelcomeMessage(newMessage);
    }
  }, [cachedName, showWelcome, welcomeMessage]);

  if (!showWelcome) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
      {/* Compact message container pinned to top with fade out to sides */}
      <div className="relative overflow-hidden animate-in slide-in-from-top duration-500">
        {/* Background with fade effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/50 to-transparent" />
        
        {/* Border with fade effect */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#FFAA00] to-transparent" />
        
        {/* Subtle glow effect in center */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FFAA00]/5 to-transparent blur-xl" />

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