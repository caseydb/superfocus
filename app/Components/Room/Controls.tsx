import React, { useState, useRef, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off } from "firebase/database";
import { signOut, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface ControlsProps {
  className?: string;
  localVolume: number;
  setLocalVolume: (v: number) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  showHistoryTooltip: boolean;
  setShowHistoryTooltip: (show: boolean) => void;
  instanceType: "public" | "private";
  setShowInviteModal: (show: boolean) => void;
  setShowTaskList: (show: boolean) => void;
  showLeaderboard: boolean;
  setShowLeaderboard: (show: boolean) => void;
}

export default function Controls({
  className = "",
  localVolume,
  setLocalVolume,
  showHistory,
  setShowHistory,
  showHistoryTooltip,
  setShowHistoryTooltip,
  instanceType,
  setShowInviteModal,
  setShowTaskList,
  showLeaderboard,
  setShowLeaderboard,
}: ControlsProps) {
  const { user, currentInstance, leaveInstance } = useInstance();
  const [editedName, setEditedName] = useState(user.displayName);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showSideModal, setShowSideModal] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(localVolume > 0 ? localVolume : 0.5);
  const soundIconRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownIconRef = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const isInDropdownMenu = dropdownRef.current && dropdownRef.current.contains(target);
      const isInDropdownIcon = dropdownIconRef.current && dropdownIconRef.current.contains(target);
      // Only close if click is outside dropdown menu and icon
      if (!isInDropdownMenu && !isInDropdownIcon) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Sync volume to RTDB when it changes
  useEffect(() => {
    if (!currentInstance || !user?.id) return;
    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
    set(userRef, { ...user, displayName: user.displayName, volume: localVolume, previousVolume });
  }, [localVolume, previousVolume, currentInstance, user]);

  // On mount, load volume from RTDB if present
  useEffect(() => {
    if (!currentInstance || !user?.id) return;
    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
    const handle = onValue(userRef, (snap) => {
      const data = snap.val();
      if (data && typeof data.volume === "number") {
        setLocalVolume(data.volume);
        // If no previousVolume saved and current volume > 0, use current as previous
        if (typeof data.previousVolume !== "number" && data.volume > 0) {
          setPreviousVolume(data.volume);
        }
      }
      if (data && typeof data.previousVolume === "number") {
        setPreviousVolume(data.previousVolume);
      }
    });
    return () => {
      off(userRef, "value", handle);
    };
  }, [currentInstance, user, setLocalVolume]);

  // Helper function to update volume and track previous volume
  const updateVolume = (newVolume: number) => {
    if (newVolume > 0) {
      setPreviousVolume(newVolume);
    }
    setLocalVolume(newVolume);
  };

  return (
    <div className={className + " select-none"}>
      <div className="flex items-center">
        {/* Speaker icon for mute/unmute toggle - hidden on mobile */}
        <div className="relative hidden sm:block">
          <span
            ref={soundIconRef}
            className="cursor-pointer flex items-center"
            onClick={() => {
              if (localVolume === 0) {
                // Unmute: restore previous volume
                setLocalVolume(previousVolume);
              } else {
                // Mute: set to 0 (don't update previousVolume)
                setLocalVolume(0);
              }
              setDropdownOpen(false);
            }}
            title={localVolume === 0 ? "Unmute" : "Mute"}
          >
            {localVolume === 0 ? (
              // Muted macOS-style speaker icon (gray-400 for header)
              <svg width="22" height="22" viewBox="0 0 28 24" fill="none">
                <g>
                  <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                  <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                  <path
                    d="M17 8c1.333 1.333 1.333 6.667 0 8"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M24 3.5c3.5 4 3.5 13 0 17"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Gray-400 border for mute line (underneath, slightly thicker and longer) */}
                  <line x1="9" y1="6" x2="26" y2="21.5" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" />
                  {/* Red mute line (on top, slightly thicker and longer) */}
                  <line x1="9" y1="6" x2="26" y2="21.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                </g>
              </svg>
            ) : (
              // Unmuted macOS-style speaker icon (gray-400 for header)
              <svg width="22" height="22" viewBox="0 0 28 24" fill="none">
                <g>
                  <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                  <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                  <path
                    d="M17 8c1.333 1.333 1.333 6.667 0 8"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M24 3.5c3.5 4 3.5 13 0 17"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
            )}
          </span>
        </div>
        {/* Name and dropdown arrow */}
        <div className="ml-3 sm:ml-3 flex flex-col">
          {/* First name with dropdown arrow */}
          <div className="flex items-center">
            <span
              className="text-base font-mono text-gray-400 select-none cursor-pointer hidden sm:block"
              onClick={() => {
                setDropdownOpen((v) => !v);
              }}
            >
              {user.displayName.split(" ")[0]}
            </span>
            {/* Mobile hamburger icon (screens < 640px) */}
            <span
              className="text-2xl font-mono text-gray-400 select-none cursor-pointer block sm:hidden"
              title="Menu"
              onClick={() => setShowSideModal(true)}
            >
              ☰
            </span>
            {/* Dropdown arrow - aligned to middle of name - hidden on mobile */}
            <span
              ref={dropdownIconRef}
              className="cursor-pointer text-gray-400 text-2xl ml-2 leading-none hidden sm:block"
              style={{ transform: "translateY(-6px)" }}
              onClick={() => {
                setDropdownOpen((v) => !v);
              }}
            >
              ⌄
            </span>
          </div>
        </div>
      </div>
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 bg-[#181A1B] text-gray-400 rounded-2xl shadow-2xl py-6 px-4 min-w-[320px] border border-[#23272b] z-50 hidden sm:block"
        >
          {/* User Header */}
          <div className="flex items-center mb-6 pb-4 border-b border-[#23272b]">
            <div className="w-12 h-12 bg-[#FFAA00] rounded-full flex items-center justify-center text-black font-bold">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3">
              <h3 className="font-semibold text-white font-mono">{user.displayName}</h3>
              <p className="text-sm text-gray-400 font-mono">{auth.currentUser?.email || ""}</p>
            </div>
          </div>

          {/* Sound Controls Section */}
          <div className="mb-6 pb-4 border-b border-[#23272b]">
            <h4 className="font-semibold text-gray-400 mb-3 font-mono">Sound</h4>
            <div className="relative flex items-center w-full h-8">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-gray-400 pointer-events-none">
                {localVolume === 0 ? (
                  // Muted speaker icon
                  <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                    <g>
                      <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                      <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                      <path
                        d="M17 8c1.333 1.333 1.333 6.667 0 8"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M24 3.5c3.5 4 3.5 13 0 17"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <line x1="9" y1="6" x2="26" y2="21.5" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" />
                      <line x1="9" y1="6" x2="26" y2="21.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  </svg>
                ) : (
                  // Unmuted speaker icon
                  <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                    <g>
                      <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                      <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                      <path
                        d="M17 8c1.333 1.333 1.333 6.667 0 8"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d="M24 3.5c3.5 4 3.5 13 0 17"
                        stroke="#9ca3af"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </g>
                  </svg>
                )}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={localVolume}
                onChange={(e) => updateVolume(Number(e.target.value))}
                className="w-full h-6 rounded-full appearance-none outline-none ml-6 slider-thumb-custom"
                style={{
                  background: (() => {
                    const offset = (24 / 320) * 100;
                    const edge = localVolume * (100 - offset) + offset / 2;
                    return `linear-gradient(to right, #fff 0%, #fff ${edge}%, #9ca3af ${edge}%, #9ca3af 100%)`;
                  })(),
                  borderRadius: "9999px",
                  boxShadow: "0 0 0 1px #23272b",
                  height: "1.5rem",
                }}
              />
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-2">
            {/* Invite Others Button */}
            <button
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
              onClick={() => {
                setShowInviteModal(true);
                setDropdownOpen(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="#9ca3af"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="group-hover:stroke-[#FFAA00]"
                />
              </svg>
              <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Invite Others</span>
            </button>

            {/* History Button */}
            <button
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
              onClick={() => {
                if (instanceType === "public") {
                  setShowHistoryTooltip(true);
                  setTimeout(() => setShowHistoryTooltip(false), 3000);
                } else {
                  setShowHistory(!showHistory);
                }
                setDropdownOpen(false);
              }}
            >
              <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">
                {showHistory ? "Timer" : "History"}
              </span>
            </button>

            {/* Edit Display Name Button */}
            <button
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
              onClick={() => {
                setShowNameModal(true);
                setDropdownOpen(false);
              }}
            >
              <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Edit Display Name</span>
            </button>

            {/* Leave Room Button */}
            <button
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
              onClick={() => {
                leaveInstance();
                router.push("/");
              }}
            >
              <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Leave Room</span>
            </button>

            {/* Sign Out Button */}
            <button
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
              onClick={async () => {
                await signOut(auth);
              }}
            >
              <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Sign Out</span>
            </button>
          </div>
        </div>
      )}
      {/* History tooltip for public rooms */}
      {showHistoryTooltip && (
        <div className="fixed bottom-20 left-8 z-50 bg-[#181A1B] text-white px-4 py-2 rounded-lg shadow-lg border border-[#23272b] text-sm font-mono">
          History is only available in private rooms.
          <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[#181A1B] border-r border-b border-[#23272b] transform rotate-45"></div>
        </div>
      )}

      {/* Name Edit Modal */}
      {showNameModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setShowNameModal(false)}
        >
          <div
            className="bg-[#181A1B] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-[#23272b] relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl"
              onClick={() => setShowNameModal(false)}
            >
              ×
            </button>

            <h2 className="text-2xl font-bold text-white mb-6">Edit Name</h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (editedName.trim() && editedName !== user.displayName) {
                  if (auth.currentUser) {
                    await updateProfile(auth.currentUser, { displayName: editedName.trim() });
                  }
                  // Update the local user state
                  user.displayName = editedName.trim();
                  if (currentInstance) {
                    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
                    set(userRef, { ...user, displayName: editedName.trim() });
                  }
                }
                setShowNameModal(false);
              }}
            >
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-[#23272b] text-gray-300 border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-sm"
                  placeholder="Enter your name"
                  maxLength={32}
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-6 py-3 font-bold rounded-lg hover:scale-105 transition-all bg-[#FFAA00] text-white w-24 justify-center flex items-center"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Side Modal for Mobile */}
      {showSideModal && (
        <div className="fixed inset-0 z-50 bg-black/80" onClick={() => setShowSideModal(false)}>
          <div
            className="fixed top-0 right-0 h-full w-80 bg-[#181A1B] shadow-2xl transform transition-transform duration-300 ease-in-out border-l border-[#23272b]"
            style={{ transform: showSideModal ? "translateX(0)" : "translateX(100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-[#23272b]">
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl"
                onClick={() => setShowSideModal(false)}
              >
                ×
              </button>
              <div className="flex items-center mt-8">
                <div className="w-12 h-12 bg-[#FFAA00] rounded-full flex items-center justify-center text-black font-bold">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3">
                  <h3 className="font-semibold text-white font-mono">{user.displayName}</h3>
                  <p className="text-sm text-gray-400 font-mono">{auth.currentUser?.email || ""}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {/* Sound Controls */}
              <div className="border-b border-[#23272b] pb-4 mb-4">
                <h4 className="font-semibold text-gray-400 mb-3 font-mono">Sound</h4>
                <div className="relative flex items-center w-full h-8">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-gray-400 pointer-events-none">
                    {localVolume === 0 ? (
                      // Muted speaker icon
                      <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                        <g>
                          <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                          <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                          <path
                            d="M17 8c1.333 1.333 1.333 6.667 0 8"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M24 3.5c3.5 4 3.5 13 0 17"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <line
                            x1="9"
                            y1="6"
                            x2="26"
                            y2="21.5"
                            stroke="#9ca3af"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          <line
                            x1="9"
                            y1="6"
                            x2="26"
                            y2="21.5"
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </g>
                      </svg>
                    ) : (
                      // Unmuted speaker icon
                      <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                        <g>
                          <rect x="2" y="8" width="5" height="8" rx="1" fill="#9ca3af" />
                          <polygon points="7,8 14,3 14,21 7,16" fill="#9ca3af" />
                          <path
                            d="M17 8c1.333 1.333 1.333 6.667 0 8"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M24 3.5c3.5 4 3.5 13 0 17"
                            stroke="#9ca3af"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </g>
                      </svg>
                    )}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={localVolume}
                    onChange={(e) => updateVolume(Number(e.target.value))}
                    className="w-full h-6 rounded-full appearance-none outline-none ml-6 slider-thumb-custom"
                    style={{
                      background: (() => {
                        const offset = (24 / 320) * 100;
                        const edge = localVolume * (100 - offset) + offset / 2;
                        return `linear-gradient(to right, #fff 0%, #fff ${edge}%, #9ca3af ${edge}%, #9ca3af 100%)`;
                      })(),
                      borderRadius: "9999px",
                      boxShadow: "0 0 0 1px #23272b",
                      height: "1.5rem",
                    }}
                  />
                </div>
              </div>

              {/* Tasks Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  setShowTaskList(true);
                  setShowSideModal(false);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                  <path
                    d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="#9ca3af"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="group-hover:stroke-[#FFAA00]"
                  />
                </svg>
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Tasks</span>
              </button>

              {/* Leaderboard Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  setShowLeaderboard(!showLeaderboard);
                  setShowSideModal(false);
                }}
              >
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Leaderboard</span>
              </button>

              {/* Invite Others Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  setShowInviteModal(true);
                  setShowSideModal(false);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="#9ca3af"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="group-hover:stroke-[#FFAA00]"
                  />
                </svg>
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Invite Others</span>
              </button>

              {/* History Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  if (instanceType === "public") {
                    setShowHistoryTooltip(true);
                    setTimeout(() => setShowHistoryTooltip(false), 3000);
                  } else {
                    setShowHistory(!showHistory);
                  }
                  setShowSideModal(false);
                }}
              >
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">
                  {showHistory ? "Timer" : "History"}
                </span>
              </button>

              {/* Edit Display Name Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  setShowNameModal(true);
                  setShowSideModal(false);
                }}
              >
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">
                  Edit Display Name
                </span>
              </button>

              {/* Leave Room Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={() => {
                  leaveInstance();
                  router.push("/");
                }}
              >
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Leave Room</span>
              </button>

              {/* Sign Out Button */}
              <button
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-[#23272b] transition-colors flex items-center group"
                onClick={async () => {
                  await signOut(auth);
                }}
              >
                <span className="text-gray-400 group-hover:text-[#FFAA00] font-medium font-mono">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
