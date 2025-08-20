"use client";
import React, { useEffect, useState } from "react";
import { useInstance } from "../Instances";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store/store";
import { updateUser } from "../../store/userSlice";
import { auth } from "../../../lib/firebase";

interface WelcomeBackMessageProps {
  roomId: string;
}

export default function WelcomeBackMessage({ roomId }: WelcomeBackMessageProps) {
  const { user } = useInstance();
  const dispatch = useDispatch();
  const reduxUser = useSelector((state: RootState) => state.user);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [inspirationalQuote, setInspirationalQuote] = useState("");
  const [hasProcessed, setHasProcessed] = useState(false);

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
    if (!user?.id || !roomId || reduxUser.loading || hasProcessed) return;

    const checkWelcomeBack = async () => {
      try {
        const firstName = user.displayName.split(" ")[0];

        // Mark as processed immediately to prevent re-runs
        setHasProcessed(true);

        // Check if this is the user's first visit ever
        if (reduxUser.first_visit) {
          // First time user
          setWelcomeMessage(`Welcome, ${firstName}!`);
          setShowWelcome(true);

          // Update first_visit to false in database (but don't wait for it)
          const currentUser = auth.currentUser;
          if (currentUser) {
            currentUser.getIdToken().then(token => {
              fetch('/api/user/first-visit', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              }).then(() => {
                // Update local Redux state after the API call completes
                dispatch(updateUser({ first_visit: false }));
              });
            });
          }
        } else {
          // Returning user
          setWelcomeMessage(`Welcome back, ${firstName}!`);
          setShowWelcome(true);
        }

        // Set inspirational quote
        setInspirationalQuote(getInspirationalQuote());
      } catch {
        // Silent error handling - error details not needed
      }
    };

    // Check immediately - no delay needed
    checkWelcomeBack();
  }, [user?.id, user?.displayName, roomId, reduxUser.first_visit, reduxUser.loading, hasProcessed, dispatch]);

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