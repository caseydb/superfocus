"use client";

import React, { useState, useEffect } from "react";
import { useInstance } from "../Instances";
import { rtdb } from "../../../lib/firebase";
import { ref, set } from "firebase/database";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../../store/store";
import { updateUser, updateUserData } from "../../store/userSlice";

interface AccountModalProps {
  onClose: () => void;
}

const AccountModal: React.FC<AccountModalProps> = ({ onClose }) => {
  const { user } = useInstance();
  const dispatch = useDispatch<AppDispatch>();
  const reduxUser = useSelector((state: RootState) => state.user);
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [isHoveringAvatar, setIsHoveringAvatar] = useState(false);

  // Initialize names from Redux user data
  useEffect(() => {
    if (reduxUser.first_name) {
      setFirstName(reduxUser.first_name);
      setLastName(reduxUser.last_name || "");
    } else if (user?.displayName) {
      const nameParts = user.displayName.split(" ");
      setFirstName(nameParts[0]);
      setLastName(nameParts.slice(1).join(" ") || "");
    }
  }, [reduxUser.first_name, reduxUser.last_name, user?.displayName]);


  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b0b]/95" 
      onClick={onClose}
    >
      <div 
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl px-4 sm:px-6 md:px-8 py-4 w-[95%] max-w-[800px] h-[85vh] flex flex-col border border-gray-800 relative overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Account</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-0 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Avatar Upload Section */}
          <div className="flex flex-col items-center">
            <div 
              className="relative group"
              onMouseEnter={() => setIsHoveringAvatar(true)}
              onMouseLeave={() => setIsHoveringAvatar(false)}
            >
              {/* Avatar Container - matching app design */}
              <button
                onClick={() => alert("Coming Soon!")}
                className="relative w-24 h-24 rounded-full overflow-hidden transition-transform duration-200 hover:scale-105 cursor-pointer"
              >
                {reduxUser.profile_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src={reduxUser.profile_image} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // If image fails to load, hide it and show initials
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-full h-full bg-gray-700 flex items-center justify-center ${
                  reduxUser.profile_image ? 'hidden' : 'flex'
                }`}>
                  <span className="text-2xl font-medium text-gray-300">
                    {(() => {
                      const firstLetter = firstName?.charAt(0) || reduxUser.first_name?.charAt(0) || 'U';
                      const lastLetter = lastName?.charAt(0) || reduxUser.last_name?.charAt(0) || '';
                      return (firstLetter + lastLetter).toUpperCase();
                    })()}
                  </span>
                </div>
                
                {/* Hover Overlay */}
                <div className={`absolute inset-0 bg-black/70 flex flex-col items-center justify-center transition-opacity duration-200 ${
                  isHoveringAvatar ? 'opacity-100' : 'opacity-0'
                }`}>
                  <svg className="w-6 h-6 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </button>
            </div>
          </div>

          {/* Personal Information Section */}
          <div className="bg-gray-800/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Personal Information</h3>
              {!isEditingName && (
                <button
                  onClick={() => {
                    setIsEditingName(true);
                    setNameError("");
                  }}
                  className="text-sm text-[#FFAA00] hover:text-[#FFB700] transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {!isEditingName ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Name</span>
                  <span className="text-sm text-gray-200 font-medium">
                    {firstName || reduxUser.first_name || "Not set"} {lastName || reduxUser.last_name || ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setNameError("");
                    }}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none text-sm"
                    placeholder="Enter first name"
                    maxLength={32}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] outline-none text-sm"
                    placeholder="Enter last name (optional)"
                    maxLength={32}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {nameError && (
              <p className="text-red-400 text-sm mt-2">{nameError}</p>
            )}

            {/* Save/Cancel buttons */}
            {isEditingName && (
              <div className="flex gap-2 mt-4 justify-end">
                <button
                  onClick={async () => {
                    // Validate first name
                    if (!firstName.trim()) {
                      setNameError("First name is required");
                      return;
                    }

                    const trimmedFirstName = firstName.trim();
                    const trimmedLastName = lastName.trim();

                    // Optimistic update to Redux
                    dispatch(
                      updateUser({
                        first_name: trimmedFirstName,
                        last_name: trimmedLastName || null,
                      })
                    );

                    // Update PostgreSQL via API
                    try {
                      await dispatch(
                        updateUserData({
                          first_name: trimmedFirstName,
                          last_name: trimmedLastName || undefined,
                        })
                      ).unwrap();
                      
                      // Update Firebase Users with the new name
                      if (user?.id) {
                        const userRef = ref(rtdb, `Users/${user.id}`);
                        await set(userRef, {
                          firstName: trimmedFirstName,
                          lastName: trimmedLastName || null,
                          updatedAt: Date.now()
                        });
                      }
                      
                      setIsEditingName(false);
                      setNameError("");
                    } catch {
                      setNameError("Failed to update name. Please try again.");
                      // Revert optimistic update on failure
                      dispatch(
                        updateUser({
                          first_name: reduxUser.first_name,
                          last_name: reduxUser.last_name,
                        })
                      );
                    }
                  }}
                  className="px-4 py-2 bg-[#FFAA00] text-black rounded-lg hover:bg-[#FFB833] transition-colors font-semibold cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    // Reset to current Redux state
                    setFirstName(reduxUser.first_name || "");
                    setLastName(reduxUser.last_name || "");
                    setIsEditingName(false);
                    setNameError("");
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Email Section */}
          <div className="bg-gray-800/50 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Email Address</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Email</span>
              <span className="text-sm text-gray-200 font-mono">
                {reduxUser.email || "No email available"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountModal;