import React, { useState, useRef, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set, onValue, off } from "firebase/database";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface ControlsProps {
  className?: string;
  localVolume: number;
  setLocalVolume: (v: number) => void;
}

export default function Controls({ className = "", localVolume, setLocalVolume }: ControlsProps) {
  const { user, currentInstance, leaveInstance } = useInstance();
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.displayName);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userMenuOpenSound, setUserMenuOpenSound] = useState(false);
  const soundDropdownRef = useRef<HTMLDivElement>(null);
  const soundIconRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownIconRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const isInSoundMenu = soundDropdownRef.current && soundDropdownRef.current.contains(target);
      const isInSoundIcon = soundIconRef.current && soundIconRef.current.contains(target);
      const isInDropdownMenu = dropdownRef.current && dropdownRef.current.contains(target);
      const isInDropdownIcon = dropdownIconRef.current && dropdownIconRef.current.contains(target);
      // Only close if click is outside both menus and both icons
      if (!isInSoundMenu && !isInSoundIcon && !isInDropdownMenu && !isInDropdownIcon) {
        setUserMenuOpenSound(false);
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleNameChange = async () => {
    setEditingName(false);
    if (!currentInstance) return;
    user.displayName = editedName;
    // Only update in users, not activeUsers
    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
    set(userRef, { ...user, displayName: editedName });
  };

  // Sync volume to RTDB when it changes
  useEffect(() => {
    if (!currentInstance || !user?.id) return;
    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
    set(userRef, { ...user, displayName: user.displayName, volume: localVolume });
  }, [localVolume, currentInstance, user]);

  // On mount, load volume from RTDB if present
  useEffect(() => {
    if (!currentInstance || !user?.id) return;
    const userRef = ref(rtdb, `instances/${currentInstance.id}/users/${user.id}`);
    const handle = onValue(userRef, (snap) => {
      const data = snap.val();
      if (data && typeof data.volume === "number") {
        setLocalVolume(data.volume);
      }
    });
    return () => {
      off(userRef, "value", handle);
    };
  }, [currentInstance, user, setLocalVolume]);

  return (
    <div className={className + " select-none"}>
      <div className="flex items-center gap-8">
        {editingName ? (
          <input
            className="bg-black text-gray-200 border-b-2 text-lg font-bold outline-none px-2 py-1"
            style={{ minWidth: 80, borderBottomColor: "#00b4ff", borderBottomWidth: 2 }}
            value={editedName}
            autoFocus
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameChange();
              if (e.key === "Escape") setEditingName(false);
            }}
            maxLength={32}
          />
        ) : (
          <span
            className="text-lg font-bold text-gray-300 cursor-pointer select-none"
            onClick={() => setEditingName(true)}
          >
            {user.displayName}
          </span>
        )}
        {/* Speaker icon and menu (Sound) to the right of the name */}
        <div className="relative ml-1">
          <span
            ref={soundIconRef}
            className="cursor-pointer flex items-center"
            onClick={() => {
              if (userMenuOpenSound) {
                setUserMenuOpenSound(false);
              } else {
                setUserMenuOpenSound(true);
                setDropdownOpen(false);
              }
            }}
            title="Sound settings"
          >
            {localVolume === 0 ? (
              // Muted macOS-style speaker icon (white for header)
              <svg width="22" height="22" viewBox="0 0 28 24" fill="none">
                <g>
                  <rect x="2" y="8" width="5" height="8" rx="1" fill="#fff" />
                  <polygon points="7,8 14,3 14,21 7,16" fill="#fff" />
                  <path
                    d="M17 8c1.333 1.333 1.333 6.667 0 8"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M24 3.5c3.5 4 3.5 13 0 17"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* White border for mute line (underneath, slightly thicker and longer) */}
                  <line x1="9" y1="6" x2="26" y2="21.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                  {/* Red mute line (on top, slightly thicker and longer) */}
                  <line x1="9" y1="6" x2="26" y2="21.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                </g>
              </svg>
            ) : (
              // Unmuted macOS-style speaker icon (white for header)
              <svg width="22" height="22" viewBox="0 0 28 24" fill="none">
                <g>
                  <rect x="2" y="8" width="5" height="8" rx="1" fill="#fff" />
                  <polygon points="7,8 14,3 14,21 7,16" fill="#fff" />
                  <path
                    d="M17 8c1.333 1.333 1.333 6.667 0 8"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M24 3.5c3.5 4 3.5 13 0 17"
                    stroke="#fff"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
            )}
          </span>
          {userMenuOpenSound && (
            <div
              ref={soundDropdownRef}
              className="absolute right-0 mt-2 bg-black text-white rounded shadow-lg py-2 px-2 min-w-[180px] border border-gray-700 flex flex-col gap-2 z-50"
            >
              <div className="flex flex-col items-start justify-between py-1 px-2">
                <span className="text-base mb-1">Sound</span>
                <div className="relative flex items-center w-40 h-8">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-gray-700 pointer-events-none ml-0">
                    {localVolume === 0 ? (
                      // Muted macOS-style speaker icon (black for slider)
                      <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                        <g>
                          <rect x="2" y="8" width="5" height="8" rx="1" fill="#111" />
                          <polygon points="7,8 14,3 14,21 7,16" fill="#111" />
                          <path
                            d="M17 8c1.333 1.333 1.333 6.667 0 8"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M24 3.5c3.5 4 3.5 13 0 17"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <line x1="9" y1="6" x2="26" y2="21.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
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
                      // Unmuted macOS-style speaker icon (black for slider)
                      <svg width="18" height="18" viewBox="0 0 28 24" fill="none">
                        <g>
                          <rect x="2" y="8" width="5" height="8" rx="1" fill="#111" />
                          <polygon points="7,8 14,3 14,21 7,16" fill="#111" />
                          <path
                            d="M17 8c1.333 1.333 1.333 6.667 0 8"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M20.5 6c2.5 2.667 2.5 10.667 0 13.334"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                          <path
                            d="M24 3.5c3.5 4 3.5 13 0 17"
                            stroke="#111"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </g>
                      </svg>
                    )}
                  </span>
                  <input
                    ref={sliderRef}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={localVolume}
                    onChange={(e) => setLocalVolume(Number(e.target.value))}
                    className="w-full h-6 rounded-full appearance-none outline-none slider-thumb-custom"
                    style={{
                      background: (() => {
                        const offset = (24 / 320) * 100; // thumbWidth/sliderWidth
                        const edge = localVolume * (100 - offset) + offset / 2;
                        return `linear-gradient(to right, #fff 0%, #fff ${edge}%, #9ca3af ${edge}%, #9ca3af 100%)`;
                      })(),
                      borderRadius: "9999px",
                      boxShadow: "0 0 0 1px #d1d5db",
                      height: "1.5rem",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Dropdown arrow */}
        <span
          ref={dropdownIconRef}
          className="cursor-pointer text-white text-lg"
          onClick={() => {
            setDropdownOpen((v) => {
              if (!v) setUserMenuOpenSound(false);
              return !v;
            });
          }}
        >
          ▼
        </span>
      </div>
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 bg-black text-white rounded shadow-lg py-2 px-2 min-w-[180px] border border-gray-700 flex flex-col gap-2 z-50"
        >
          <button
            className="w-full px-6 py-3 text-white bg-black rounded font-bold text-base hover:bg-gray-900 transition text-left"
            style={{ outline: "none" }}
            onClick={async () => {
              await signOut(auth);
            }}
          >
            Sign Out
          </button>
          <button
            className="w-full px-6 py-3 text-white bg-black rounded font-bold text-base hover:bg-gray-900 transition text-left"
            style={{ outline: "none" }}
            onClick={() => {
              leaveInstance();
              router.push("/");
            }}
          >
            Leave Room
          </button>
        </div>
      )}
    </div>
  );
}
