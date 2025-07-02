import React, { useState } from "react";
import { useInstance } from "../Instances";
import { db } from "../../firebase";
import { ref, set } from "firebase/database";

export default function Controls({ className = "" }: { className?: string }) {
  const { user, currentInstance } = useInstance();
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user.displayName);

  const handleNameChange = async () => {
    setEditingName(false);
    if (!currentInstance) return;
    user.displayName = editedName;
    // Only update in users, not activeUsers
    const userRef = ref(db, `instances/${currentInstance.id}/users/${user.id}`);
    set(userRef, { ...user, displayName: editedName });
  };

  return (
    <div className={className}>
      {editingName ? (
        <input
          className="bg-black text-gray-200 border-b-2 text-lg font-bold outline-none px-2 py-1"
          value={editedName}
          autoFocus
          onChange={(e) => setEditedName(e.target.value)}
          onBlur={handleNameChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameChange();
            if (e.key === "Escape") setEditingName(false);
          }}
          maxLength={32}
          style={{ minWidth: 80, borderBottomColor: "#00b4ff", borderBottomWidth: 2 }}
        />
      ) : (
        <span
          className="text-lg font-bold text-gray-300 cursor-pointer select-none"
          onClick={() => setEditingName(true)}
        >
          {user.displayName}
        </span>
      )}
    </div>
  );
}
