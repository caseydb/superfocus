"use client";
import React, { useState, useEffect } from "react";
import { signOutUser, signInWithGoogle } from "@/lib/auth";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { setPreference, updatePreferences } from "../../store/preferenceSlice";
import SignIn from "../SignIn";

interface MobileMenuProps {
  localVolume: number;
  setLocalVolume: (volume: number) => void;
  setShowHistory: (show: boolean) => void;
  setShowLeaderboard: (show: boolean) => void;
  setShowAnalytics: (show: boolean) => void;
  setShowPreferences: (show: boolean) => void;
  setShowRoomsModal: (show: boolean) => void;
  setShowInviteModal: (show: boolean) => void;
  instanceType?: string;
  closeAllModals: () => void;
  isModalOpen?: boolean;
}

export default function MobileMenu({
  localVolume,
  setLocalVolume,
  setShowHistory,
  setShowLeaderboard,
  setShowAnalytics,
  setShowPreferences,
  setShowRoomsModal,
  setShowInviteModal,
  instanceType,
  closeAllModals,
  isModalOpen = false,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [volumeSliderVisible, setVolumeSliderVisible] = useState(false);
  const [timerModeVisible, setTimerModeVisible] = useState(false);
  const reduxUser = useSelector((state: RootState) => state.user);
  const preferences = useSelector((state: RootState) => state.preferences);
  const dispatch = useDispatch<AppDispatch>();
  const isPomodoroMode = preferences.mode === "countdown";
  const [showSignInModal, setShowSignInModal] = useState(false);
  const isGuestUser = reduxUser.isGuest !== false;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('.mobile-menu-container')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (isModalOpen && isOpen) {
      setIsOpen(false);
    }
  }, [isModalOpen, isOpen]);

  const handleMenuItemClick = (action: () => void) => {
    closeAllModals();
    action();
    setIsOpen(false);
  };

  const handleSignOut = async () => {
    await signOutUser();
    window.location.href = "/";
  };

  return (
    <div className="mobile-menu-container md:hidden">
      {/* Fixed position wrapper to ensure consistent positioning */}
      <div className="fixed top-0 right-0 p-4 z-[110]" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 items-center justify-center rounded-lg transition-all duration-300 ${
          isOpen ? 'bg-[#FFAA00]/20' : 'bg-gray-800/50 hover:bg-gray-800'
        } ${isModalOpen ? 'hidden' : 'flex'}`}
        aria-label="Menu"
      >
        <div className="w-6 h-5 relative flex flex-col justify-between">
          <span
            className={`block w-full h-0.5 bg-white transform transition-all duration-300 origin-left ${
              isOpen ? 'rotate-45 translate-y-[1px]' : ''
            }`}
          />
          <span
            className={`block w-full h-0.5 bg-white transition-all duration-300 ${
              isOpen ? 'opacity-0 scale-0' : ''
            }`}
          />
          <span
            className={`block w-full h-0.5 bg-white transform transition-all duration-300 origin-left ${
              isOpen ? '-rotate-45 -translate-y-[1px]' : ''
            }`}
          />
        </div>
      </button>

      {/* Menu Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Menu Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Menu Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Menu</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* User Info */}
          {reduxUser?.email && (
            <div className="text-sm text-gray-400">
              <p className="font-medium text-white truncate">
                {reduxUser.first_name && reduxUser.last_name
                  ? `${reduxUser.first_name} ${reduxUser.last_name}`
                  : reduxUser.first_name || 'User'}
              </p>
              <p className="truncate">{reduxUser.email}</p>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* Volume Control */}
          <div className="p-3 rounded-lg bg-gray-800/50">
            <button
              onClick={() => setVolumeSliderVisible(!volumeSliderVisible)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                  <path
                    d="M11 5L6 9H2V15H6L11 19V5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {localVolume > 0 && (
                    <path
                      d="M19.07 4.93C20.97 6.83 22 9.35 22 12C22 14.65 20.97 17.17 19.07 19.07M15.54 8.46C16.48 9.4 17 10.7 17 12C17 13.3 16.48 14.6 15.54 15.54"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
                <span className="text-white">Volume: {Math.round(localVolume * 100)}%</span>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className={`text-gray-400 transform transition-transform ${
                  volumeSliderVisible ? 'rotate-180' : ''
                }`}
              >
                <path
                  d="M6 9L12 15L18 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            
            {volumeSliderVisible && (
              <div className="mt-4 px-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={localVolume}
                  onChange={(e) => setLocalVolume(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                />
              </div>
            )}
          </div>

          {/* Preferences */}
          <button
            onClick={() => handleMenuItemClick(() => setShowPreferences(true))}
            className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400">
              <path
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-white">Preferences</span>
          </button>

          {/* Timer Mode Toggle */}
          <div className="relative">
            <button
              onClick={() => setTimerModeVisible(!timerModeVisible)}
              className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {isPomodoroMode ? (
                  <div 
                    className="w-5 h-5 bg-gray-400"
                    style={{
                      WebkitMask: `url(/hourglass-icon.svg) no-repeat center`,
                      mask: `url(/hourglass-icon.svg) no-repeat center`,
                      WebkitMaskSize: "contain",
                      maskSize: "contain",
                    }}
                  />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 6V12L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                <span className="text-white">{isPomodoroMode ? 'Pomodoro' : 'Deep Work'}</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${timerModeVisible ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {timerModeVisible && (
              <div className="mt-2 px-3 pb-2">
                <button
                  onClick={async () => {
                    const newMode = isPomodoroMode ? "stopwatch" : "countdown";
                    // Optimistic update
                    dispatch(setPreference({ key: "mode", value: newMode }));
                    
                    // Database update if user is logged in
                    if (reduxUser.user_id) {
                      try {
                        await dispatch(
                          updatePreferences({
                            userId: reduxUser.user_id,
                            updates: { mode: newMode }
                          })
                        ).unwrap();
                      } catch (error) {
                        console.error("Failed to update timer mode:", error);
                      }
                    }
                    
                    // Close the dropdown after selection
                    setTimerModeVisible(false);
                  }}
                  className="w-full bg-gray-700 rounded-full p-1 transition-colors hover:bg-gray-600"
                >
                  <div className="flex items-center">
                    <div className={`flex-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      !isPomodoroMode ? 'bg-[#FFAA00] text-black' : 'text-gray-400'
                    }`}>
                      Deep Work
                    </div>
                    <div className={`flex-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      isPomodoroMode ? 'bg-[#FFAA00] text-black' : 'text-gray-400'
                    }`}>
                      Pomodoro
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <button
            onClick={() => handleMenuItemClick(() => setShowAnalytics(true))}
            className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <div
              className="w-5 h-5 bg-gray-400 sf-navicon"
              style={{
                WebkitMask: `url(/analytics-icon.svg) no-repeat center`,
                mask: `url(/analytics-icon.svg) no-repeat center`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
            <span className="text-white">Analytics</span>
          </button>

          <button
            onClick={() => handleMenuItemClick(() => setShowLeaderboard(true))}
            className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <div
              className="w-5 h-5 bg-gray-400 sf-navicon"
              style={{
                WebkitMask: `url(/crown-icon.svg) no-repeat center`,
                mask: `url(/crown-icon.svg) no-repeat center`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
            <span className="text-white">Leaderboard</span>
          </button>

          <button
            onClick={() => handleMenuItemClick(() => setShowHistory(true))}
            className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <div
              className="w-5 h-5 bg-gray-400 sf-navicon"
              style={{
                WebkitMask: `url(/history-icon.svg) no-repeat center`,
                mask: `url(/history-icon.svg) no-repeat center`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
            <span className="text-white">History</span>
          </button>

          {/* Feedback */}
          <button
            onClick={() =>
              handleMenuItemClick(() => window.open("https://getlockedin.featurebase.app/", "_blank"))
            }
            className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400">
              <path
                d="M9 18h6M10 21h4M12 3a6 6 0 00-3 11.24V17a1 1 0 00.55.89l1.45.72h2l1.45-.72A1 1 0 0015 17v-2.76A6 6 0 0012 3z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 7v4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-white">Feedback</span>
          </button>

          {/* Divider */}
          <div className="h-px bg-gray-800 my-4" />

          {!isGuestUser && (
            <button
              onClick={() => handleMenuItemClick(() => setShowRoomsModal(true))}
              className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400 sf-navicon-svg">
                <path
                  d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 21V5C16 3.89543 15.1046 3 14 3H10C8.89543 3 8 3.89543 8 5V21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-white">Rooms</span>
            </button>
          )}

          {instanceType === 'private' && (
            <button
              onClick={() => handleMenuItemClick(() => setShowInviteModal(true))}
              className="w-full p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors flex items-center gap-3"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                <path
                  d="M16 21V19C16 16.7909 14.2091 15 12 15H5C2.79086 15 1 16.7909 1 19V21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="8.5"
                  cy="7"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 8V14M23 11H17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-white">Invite</span>
            </button>
          )}

          {/* Authentication Actions */}
          {isGuestUser ? (
            <>
              <div className="mx-3 my-2 border-t border-gray-800/50"></div>
              <button
                onClick={async () => {
                  closeAllModals();
                  setIsOpen(false);
                  await signInWithGoogle();
                }}
                className="w-full flex items-center justify-center gap-3 px-3 py-2.5 mx-3 mb-2 rounded-md bg-white text-black font-bold hover:bg-gray-100 transition-all duration-200"
                style={{ width: "calc(100% - 1.5rem)" }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="px-3 mb-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800/30"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-gray-900 text-gray-500">or</span>
                  </div>
                </div>
              </div>

              <button
                className="w-full text-center px-3 py-2 mx-3 mb-2 text-gray-400 hover:text-white text-sm transition-colors"
                style={{ width: "calc(100% - 1.5rem)" }}
                onClick={() => {
                  closeAllModals();
                  setIsOpen(false);
                  setShowSignInModal(true);
                }}
              >
                Sign in with email
              </button>
            </>
          ) : (
            <>
              <div className="h-px bg-gray-800 my-4" />
              <button
                onClick={handleSignOut}
                className="w-full p-3 rounded-lg bg-red-900/20 hover:bg-red-900/30 transition-colors flex items-center gap-3 text-red-400"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 17L21 12L16 7M21 12H9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Sign Out</span>
              </button>
            </>
          )}
        </div>
      </div>
      </div>
      {showSignInModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowSignInModal(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <SignIn onSuccess={() => setShowSignInModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
