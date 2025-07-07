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
  const [countdown, setCountdown] = useState(5);

  // Epic welcome messages based on user's streak and return status
  const getWelcomeMessage = (streak: number, lastVisit: number) => {
    const daysSinceLastVisit = Math.floor((Date.now() - lastVisit) / (1000 * 60 * 60 * 24));

    const epicMessages = [
      // Recent return (same day)
      ...(daysSinceLastVisit === 0
        ? [
            `🔥 THE GRIND NEVER STOPS! Welcome back, ${user.displayName}!`,
            `⚡ BACK FOR MORE? ${user.displayName} is UNSTOPPABLE!`,
            `🚀 LOCKED AND LOADED! ${user.displayName} returns to the battlefield!`,
            `💎 DIAMOND HANDS! ${user.displayName} never quits!`,
            `🎯 LASER FOCUSED! ${user.displayName} is back in the zone!`,
          ]
        : []),

      // 1-3 days
      ...(daysSinceLastVisit >= 1 && daysSinceLastVisit <= 3
        ? [
            `🌟 THE LEGEND RETURNS! ${user.displayName} is back after ${daysSinceLastVisit} day${
              daysSinceLastVisit > 1 ? "s" : ""
            }!`,
            `⚔️ WARRIOR'S RETURN! ${user.displayName} emerges from the shadows!`,
            `🏆 CHAMPION COMEBACK! ${user.displayName} never stays down!`,
            `🔥 PHOENIX RISING! ${user.displayName} returns stronger than ever!`,
            `💪 BEAST MODE ACTIVATED! ${user.displayName} is BACK!`,
          ]
        : []),

      // 4-7 days
      ...(daysSinceLastVisit >= 4 && daysSinceLastVisit <= 7
        ? [
            `🎭 THE PRODIGAL WARRIOR! ${user.displayName} returns after ${daysSinceLastVisit} days!`,
            `🌪️ STORM'S RETURN! ${user.displayName} brings the thunder!`,
            `🗡️ BLADE REFORGED! ${user.displayName} emerges from the forge!`,
            `🎪 THE SHOW MUST GO ON! ${user.displayName} takes center stage!`,
            `🚁 TACTICAL INSERTION! ${user.displayName} drops back into action!`,
          ]
        : []),

      // 1+ weeks
      ...(daysSinceLastVisit >= 8
        ? [
            `🌋 VOLCANIC ERUPTION! ${user.displayName} returns after ${daysSinceLastVisit} days of silence!`,
            `🎆 GRAND FINALE! ${user.displayName} makes a SPECTACULAR return!`,
            `🏰 KINGDOM RECLAIMED! ${user.displayName} has returned to rule!`,
            `🌌 COSMIC COMEBACK! ${user.displayName} descends from the stars!`,
            `🎭 EPIC RESURRECTION! ${user.displayName} rises from the ashes!`,
          ]
        : []),
    ];

    // Add streak-based messages
    if (streak >= 10) {
      epicMessages.push(
        `🔥💎 STREAK DEMON! ${user.displayName} returns with a ${streak}-day streak!`,
        `⚡🏆 LEGENDARY STREAK! ${user.displayName} (${streak} days) is UNSTOPPABLE!`
      );
    } else if (streak >= 5) {
      epicMessages.push(
        `🚀💪 STREAK MASTER! ${user.displayName} maintains their ${streak}-day streak!`,
        `🎯🔥 HOT STREAK! ${user.displayName} (${streak} days) is ON FIRE!`
      );
    }

    return epicMessages[Math.floor(Math.random() * epicMessages.length)] || `🎉 Welcome back, ${user.displayName}!`;
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

        // Get user's streak
        const streakRef = ref(rtdb, `users/${user.id}/dailyCompletions`);
        const streakSnapshot = await get(streakRef);
        const dailyCompletions = streakSnapshot.val() || {};

        // Calculate streak (same logic as PersonalStats)
        const calculateStreak = (dailyCompletions: Record<string, boolean>) => {
          if (!dailyCompletions) return 0;

          const getStreakDate = (timestamp: number = Date.now()) => {
            const date = new Date(timestamp);
            const hour = date.getHours();
            if (hour < 4) {
              date.setDate(date.getDate() - 1);
            }
            return date.toISOString().split("T")[0];
          };

          let currentStreak = 0;
          const currentStreakDate = getStreakDate();

          for (let i = 0; i < 365; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i);
            if (new Date().getHours() < 4) {
              checkDate.setDate(checkDate.getDate() - 1);
            }
            const streakDateStr = checkDate.toISOString().split("T")[0];

            if (dailyCompletions[streakDateStr]) {
              currentStreak++;
            } else {
              if (streakDateStr !== currentStreakDate) {
                break;
              }
            }
          }
          return currentStreak;
        };

        const currentStreak = calculateStreak(dailyCompletions);
        const now = Date.now();

        // Show welcome message EVERY time user enters the room!
        if (lastVisit) {
          // Returning user - show epic return message
          setIsReturningUser(true);
          setWelcomeMessage(getWelcomeMessage(currentStreak, lastVisit));
          setCountdown(5);
          setShowWelcome(true);
        } else {
          // First time in this room
          setIsReturningUser(false);
          setWelcomeMessage(`🔥 Warning: Side effects may include crushing your to-do list`);
          setCountdown(5);
          setShowWelcome(true);
        }

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
        <div className="text-center space-y-4">
          {/* Epic message */}
          <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#FFAA00] via-yellow-300 to-[#FFAA00] animate-pulse leading-tight">
            {welcomeMessage}
          </div>

          {/* Subtitle */}
          <div className="text-lg sm:text-xl text-gray-300 font-mono opacity-90 animate-in slide-in-from-bottom duration-1000 delay-500">
            {isReturningUser ? `The grind continues in ${countdown}...` : `The grind starts in ${countdown}...`}
          </div>

          {/* Sparkle effects */}
          <div className="flex justify-center space-x-2 text-2xl animate-bounce">
            <span className="animate-pulse">✨</span>
            <span className="animate-pulse animation-delay-200">⚡</span>
            <span className="animate-pulse animation-delay-400">🔥</span>
            <span className="animate-pulse animation-delay-600">💎</span>
            <span className="animate-pulse animation-delay-800">🚀</span>
          </div>

          {/* Subtle continue hint */}
          <div className="text-sm text-gray-500 font-mono opacity-60 animate-in fade-in duration-1000 delay-1000">
            Press Enter to continue
          </div>
        </div>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-[#FFAA00] rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
