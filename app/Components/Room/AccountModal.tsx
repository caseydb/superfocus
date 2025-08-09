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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65" 
      onClick={onClose}
    >
      <div 
        className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl w-[95%] max-w-[800px] max-h-[85vh] flex flex-col border border-gray-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center px-6 py-6 border-b border-gray-800/50">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#FFAA00]">Account</h2>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-6 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors flex items-center justify-center group cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-400 group-hover:text-[#FFAA00] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-6 max-w-3xl mx-auto">
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
              <h3 className="text-lg font-bold text-white mb-6">Personal Information</h3>
              
              <div className="space-y-4">
                {/* First Name Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setNameError("");
                    }}
                    className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] focus:bg-gray-700 outline-none transition-all duration-200 placeholder-gray-500"
                    placeholder="Enter your first name"
                    maxLength={32}
                  />
                </div>

                {/* Last Name Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setNameError("");
                    }}
                    className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg border border-gray-600 focus:border-[#FFAA00] focus:bg-gray-700 outline-none transition-all duration-200 placeholder-gray-500"
                    placeholder="Enter your last name (optional)"
                    maxLength={32}
                  />
                </div>

                {/* Error message */}
                {nameError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{nameError}</span>
                  </div>
                )}

                {/* Save button - always visible */}
                <div className="pt-2">
                  <button
                    onClick={async () => {
                      // Validate first name
                      if (!firstName.trim()) {
                        setNameError("First name is required");
                        return;
                      }

                      const trimmedFirstName = firstName.trim();
                      const trimmedLastName = lastName.trim();

                      // Check if values actually changed
                      if (trimmedFirstName === reduxUser.first_name && trimmedLastName === (reduxUser.last_name || '')) {
                        setNameError("");
                        return; // No changes to save
                      }

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
                        
                        setNameError("");
                        
                        // Show success feedback (optional)
                        const button = document.getElementById('save-account-btn');
                        if (button) {
                          const originalText = button.innerHTML;
                          button.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Saved!';
                          button.classList.add('bg-green-600', 'hover:bg-green-700');
                          button.classList.remove('bg-gray-700', 'hover:bg-[#FFAA00]', 'hover:text-black');
                          button.classList.add('text-white');
                          setTimeout(() => {
                            button.innerHTML = originalText;
                            button.classList.remove('bg-green-600', 'hover:bg-green-700');
                            button.classList.add('bg-gray-700', 'hover:bg-[#FFAA00]', 'hover:text-black');
                          }, 2000);
                        }
                      } catch {
                        setNameError("Failed to update. Please try again.");
                        // Revert optimistic update on failure
                        dispatch(
                          updateUser({
                            first_name: reduxUser.first_name,
                            last_name: reduxUser.last_name,
                          })
                        );
                      }
                    }}
                    id="save-account-btn"
                    className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-[#FFAA00] hover:text-black transition-all duration-200 font-semibold cursor-pointer flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </button>
                </div>
              </div>
          </div>

            {/* Email Section */}
            <div className="bg-gray-800/50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-white mb-6">Email Address</h3>
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
    </div>
  );
};

export default AccountModal;