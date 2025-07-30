"use client";
import React, { useState, useEffect, useCallback } from "react";

interface InvitePopupProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: string;
  stats?: {
    totalTasks: number;
    totalHours: number;
  };
}

export default function InvitePopup({ isOpen, onClose, milestone }: InvitePopupProps) {
  const [copied, setCopied] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const shareUrl = "https://locked-in.work/gsd";

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Handle escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setShowTooltip(true); // Keep tooltip visible while showing "Copied!"
    setTimeout(() => {
      setCopied(false);
      setShowTooltip(false); // Hide tooltip after 2 seconds
    }, 2000);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800 relative transform transition-all duration-300 ${
          isClosing ? "scale-95" : "scale-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl cursor-pointer"
          onClick={handleClose}
        >
          ×
        </button>

        {/* Animated gradient background */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FFAA00]/10 via-transparent to-[#FFAA00]/5 animate-pulse" />

        {/* Content */}
        <div className="relative">
          {/* Icon with animation */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-[#FFAA00]/20 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-10 h-10 text-[#FFAA00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              {/* Orbiting dots */}
              <div className="absolute inset-0 animate-spin-slow">
                <div className="absolute top-0 left-1/2 w-2 h-2 bg-[#FFAA00] rounded-full -translate-x-1/2 -translate-y-2" />
                <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-[#FFAA00] rounded-full -translate-x-1/2 translate-y-2" />
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3 text-center">
            {milestone === "5_tasks" ? (
              <>Congrats on 5 Tasks! 🎉</>
            ) : milestone === "5_hours" ? (
              <>You&apos;ve Worked 5 Hours! 🔥</>
            ) : (
              <>Keep Going! 💪</>
            )}
          </h2>

          <p className="text-gray-300 mb-6 text-center leading-relaxed">
            Invite a friend! Work is easier when you&apos;re not alone.
          </p>

          {/* Benefits list */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm">Co-working keeps you both locked in</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm">Track wins and celebrate progress</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm">Work habits improve when it&apos;s not solo</span>
            </div>
          </div>

          {/* Share link section */}
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-400 mb-2">Share this link:</p>
            <div className="relative">
              <input
                type="text"
                value={shareUrl}
                readOnly
                onClick={handleCopy}
                onMouseEnter={() => !copied && setShowTooltip(true)}
                onMouseLeave={() => !copied && setShowTooltip(false)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 text-gray-300 border border-gray-700 text-sm font-mono cursor-pointer hover:border-gray-600 transition-colors"
              />
              {/* Tooltip */}
              {(showTooltip || copied) && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 pointer-events-none">
                  <div className="bg-gray-700 text-white text-xs px-2 py-1 rounded">
                    {copied ? "Copied!" : "Click to copy"}
                  </div>
                  {/* Arrow pointing down */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-700"></div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] font-semibold cursor-pointer"
            >
              Maybe Later
            </button>
            <button
              onClick={() => {
                handleCopy();
                // Could open share dialog or social media share here
              }}
              className="flex-1 bg-[#FFAA00] text-black px-6 py-3 rounded-lg hover:bg-[#ff9900] transition-all duration-200 transform hover:scale-[1.02] font-bold cursor-pointer"
            >
              Copy & Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
