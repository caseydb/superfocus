import React, { useState } from "react";
import { useInstance } from "../Instances";
import { db } from "../../firebase";
import { ref, set } from "firebase/database";

export default function Controls({ className = "" }: { className?: string }) {
  const { user, currentInstance } = useInstance();
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.displayName);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleNameChange = async () => {
    setEditingName(false);
    if (!currentInstance) return;
    user.displayName = editedName;
    // Only update in users, not activeUsers
    const userRef = ref(db, `instances/${currentInstance.id}/users/${user.id}`);
    set(userRef, { ...user, displayName: editedName });
  };

  return (
    <div className={className + " relative select-none"}>
      <div className="flex items-center gap-1">
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
        {/* Speaker icon placeholder */}
        <span className="ml-1 mr-1">🔊</span>
        {/* Dropdown arrow */}
        <span className="cursor-pointer text-white text-lg" onClick={() => setDropdownOpen((v) => !v)}>
          ▼
        </span>
      </div>
      {dropdownOpen && (
        <div
          className="absolute right-0 mt-2 bg-black border border-white rounded shadow-lg z-50"
          style={{ minWidth: 140 }}
        >
          <button
            className="w-full px-6 py-3 text-white bg-black border border-white rounded font-bold text-base hover:bg-gray-900 transition text-center"
            style={{ outline: "none" }}
            onClick={() => {
              /* No-op for now */
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
