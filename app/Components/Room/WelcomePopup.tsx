"use client";
import React, { useEffect, useState, useCallback } from "react";

export default function WelcomePopup({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800 relative transform transition-all duration-300 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FFAA00]/10 via-transparent to-[#FFAA00]/5 animate-pulse" />

        <div className="relative">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute -top-6 -right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Brand badge */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-[6.5rem] h-[6.5rem] bg-[#FFAA00]/20 rounded-full flex items-center justify-center animate-pulse overflow-hidden">
                <div className="text-[#FFAA00] font-extrabold uppercase tracking-widest leading-none text-[10px] select-none w-[80%] text-center whitespace-nowrap">
                  SUPERFOCUS
                </div>
              </div>
              {/* Orbiting dots */}
              <div className="absolute inset-0 animate-spin-slow">
                <div className="absolute top-0 left-1/2 w-3 h-3 bg-[#FFAA00] rounded-full -translate-x-1/2 -translate-y-2" />
                <div className="absolute bottom-0 left-1/2 w-3 h-3 bg-[#FFAA00] rounded-full -translate-x-1/2 translate-y-2" />
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2 text-center">Welcome aboard! 🎉</h2>
          <p className="text-gray-300 mb-6 text-center leading-relaxed">
            Your account is ready. Jump in and work alongside others in the zone while you do your best work.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition-all duration-200 transform hover:scale-[1.02] font-semibold cursor-pointer"
            >
              Let’s go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
