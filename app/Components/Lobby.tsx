"use client";

import { useInstance } from "../Components/Instances";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SignOut from "./SignOut";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SignIn from "./SignIn";
import { signInWithGoogle } from "@/lib/auth";
import Image from "next/image";

export default function Lobby() {
  const { instances, currentInstance, createInstance, leaveInstance } = useInstance();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showPrivateRoomModal, setShowPrivateRoomModal] = useState(false);
  const [privateRoomName, setPrivateRoomName] = useState("");
  const [roomNameError, setRoomNameError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setSignedIn(!!user));
    return () => unsub();
  }, []);

  // Close modal when signed in
  useEffect(() => {
    if (signedIn) setShowSignInModal(false);
  }, [signedIn]);

  // Redirect to room URL when joining a room
  useEffect(() => {
    if (currentInstance) {
      router.push(`/${currentInstance.url}`);
    }
  }, [currentInstance, router]);

  // Leave room on tab close or refresh
  useEffect(() => {
    if (!currentInstance) return;
    const handleUnload = () => leaveInstance();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [currentInstance, leaveInstance]);

  // Calculate total users in all rooms
  const totalUsers = instances.reduce((sum, instance) => sum + instance.users.length, 0);

  // Check if room name is already taken
  const isRoomNameTaken = (name: string) => {
    return instances.some((instance) => instance.url === name);
  };

  const handleCreatePrivateRoom = () => {
    const roomName = privateRoomName.trim();
    if (!roomName) return;

    if (isRoomNameTaken(roomName)) {
      setRoomNameError("Room name already taken. Please choose a different name.");
      return;
    }

    createInstance("private", roomName);
    setShowPrivateRoomModal(false);
    setPrivateRoomName("");
    setRoomNameError("");
  };

  // If user is in a room, they should be redirected to the room URL
  if (currentInstance) {
    return (
      <div className="bg-white/90 rounded-xl shadow-xl p-8 w-full max-w-md flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Redirecting to room...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-black text-white overflow-hidden">
      {signedIn && (
        <div className="fixed top-6 right-8 z-50">
          <SignOut />
        </div>
      )}
      <div className="w-full flex flex-col items-center mb-10 mt-2">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
          Drop In. Lock In. Get Sh<span style={{ color: "#FFAA00" }}>*</span>t Done.
        </h1>
        <p className="text-lg md:text-2xl text-gray-300 text-center max-w-2xl mx-auto opacity-90 font-medium">
          Level up your work with others in the zone.
        </p>
      </div>
      {!signedIn && (
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={() => signInWithGoogle()}
            className="w-full max-w-xs flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 px-6 bg-white text-gray-900 text-lg font-medium shadow-sm hover:border-[#FFAA00] transition"
          >
            <Image src="/google.png" alt="Google" width={24} height={24} className="mr-2" />
            Continue with Google
          </button>
          <div className="mt-4 text-gray-300 text-base">
            Don&apos;t have an account?{" "}
            <button
              className="font-bold underline underline-offset-2 hover:text-[#FFAA00] transition"
              onClick={() => setShowSignInModal(true)}
            >
              Sign up
            </button>
          </div>
        </div>
      )}
      {showSignInModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowSignInModal(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <SignIn />
          </div>
        </div>
      )}
      <div
        className={`bg-gray-900/90 mb-10 rounded-2xl shadow-2xl p-8 w-full max-w-2xl flex flex-col items-center gap-6 border-4 transition-all duration-200 ${
          !signedIn ? "opacity-40 pointer-events-none grayscale" : ""
        }`}
        style={{ borderColor: "#FFAA00" }}
      >
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Join a Room</h1>
        <button
          className="bg-white text-black font-extrabold py-4 px-10 rounded-full shadow transition mb-1 text-2xl border"
          style={{ borderColor: "#FFAA00" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#FFAA00")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
          onClick={() => {
            // Temporary redirect to /GSD instead of lobby logic
            window.location.href = "/GSD";
            // Original logic (kept for reference):
            // const available = instances.find((i) => i.users.length < 5 && i.type === "public");
            // if (available) {
            //   joinInstance(available.id);
            // } else {
            //   createInstance("public");
            // }
          }}
        >
          🚀 Quick Join
        </button>
        <div className="text-gray-400 text-lg mt-1 mb-2 font-mono opacity-80 text-center">
          {totalUsers > 0
            ? `There ${totalUsers === 1 ? "is" : "are"} ${totalUsers} other ${
                totalUsers === 1 ? "person" : "people"
              } working right now`
            : "Be the first to start working!"}
        </div>
        <button
          className="bg-white text-black px-4 py-2 rounded-full font-medium transition mt-1 text-base border"
          style={{ borderColor: "#FFAA00" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#FFAA00")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
          onClick={() => setShowPrivateRoomModal(true)}
        >
          Create Private Room
        </button>
      </div>

      {/* Private Room Name Modal */}
      {showPrivateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-[#181A1B] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-[#23272b] relative">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl"
              onClick={() => {
                setShowPrivateRoomModal(false);
                setPrivateRoomName("");
                setRoomNameError("");
              }}
            >
              ×
            </button>

            <h2 className="text-2xl font-bold text-white mb-6">Create Private Room</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Room Name</label>
              <input
                type="text"
                value={privateRoomName}
                onChange={(e) => {
                  setPrivateRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setRoomNameError(""); // Clear error when typing
                }}
                placeholder="my-awesome-room"
                className={`w-full px-4 py-3 rounded-lg bg-[#23272b] text-white border outline-none font-mono ${
                  roomNameError ? "border-red-500 focus:border-red-500" : "border-[#23272b] focus:border-[#FFAA00]"
                }`}
                maxLength={30}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && privateRoomName.trim()) {
                    handleCreatePrivateRoom();
                  } else if (e.key === "Escape") {
                    setShowPrivateRoomModal(false);
                    setPrivateRoomName("");
                    setRoomNameError("");
                  }
                }}
              />
              {roomNameError ? (
                <p className="text-xs text-red-400 mt-2">{roomNameError}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">Only lowercase letters, numbers, and hyphens allowed</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                onClick={() => {
                  setShowPrivateRoomModal(false);
                  setPrivateRoomName("");
                  setRoomNameError("");
                }}
              >
                Cancel
              </button>
              <button
                // className="flex-1 px-4 py-3 bg-[#00b4ff] text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                className="flex-1 px-4 py-3 bg-[#FFAA00] text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                disabled={!privateRoomName.trim()}
                onClick={handleCreatePrivateRoom}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
