"use client";

import React from "react";

interface BillingModalProps {
  onClose: () => void;
}

const BillingModal: React.FC<BillingModalProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/45 sf-modal-overlay" 
      onClick={onClose}
    >
      <div 
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[800px] h-[85vh] flex flex-col border border-gray-800 relative sf-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4 sf-modal-header">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Plan & Billing</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-0 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer sf-modal-close"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-md">
            {/* Icon */}
            <div className="w-24 h-24 bg-[#FFAA00]/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-12 h-12 text-[#FFAA00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="6" width="18" height="12" rx="2" strokeWidth="2" />
                <path d="M3 10h18" strokeWidth="2" />
                <path d="M7 14h4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            
            {/* Coming Soon Message */}
            <div className="space-y-3">
              <h3 className="text-3xl font-bold text-white">Individual Premium</h3>
              <h4 className="text-2xl font-semibold text-[#FFAA00]">Coming Soon</h4>
              <p className="text-gray-400 text-lg leading-relaxed">
                We&apos;re working on bringing you flexible plans and billing options. 
                Stay tuned for updates!
              </p>
            </div>

            {/* Features Preview */}
            <div className="bg-gray-800/50 rounded-xl p-6 space-y-4 sf-card">
              <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wide">What to expect</h4>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300 text-sm">Flexible monthly and annual plans</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300 text-sm">Team collaboration features</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300 text-sm">Advanced analytics and insights</span>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300 text-sm">Priority support</span>
                </div>
              </div>
            </div>

            {/* Current Status */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/60 rounded-full sf-card">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Currently in free beta</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingModal;
