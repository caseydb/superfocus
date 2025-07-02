"use client";

import { useInstance } from "../Components/Instances";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Lobby() {
  const { instances, currentInstance, joinInstance, createInstance, leaveInstance } = useInstance();
  const router = useRouter();

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

  useEffect(() => {
    if (instances.length > 0) {
      console.log("Active rooms:");
      instances.forEach((instance) => {
        console.log(`Room: ${instance.url}, Type: ${instance.type}, Users: ${instance.users.length}`);
      });
    }
  }, [instances]);

  // Calculate total users in all rooms
  const totalUsers = instances.reduce((sum, instance) => sum + instance.users.length, 0);

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
      <div className="w-full flex flex-col items-center mb-20 mt-2">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
          Drop In. Lock In. Get Sh*t Done.
        </h1>
        <p className="text-lg md:text-2xl text-gray-300 text-center max-w-2xl mx-auto opacity-90 font-medium">
          Level up your work with others in the zone.
        </p>
      </div>
      <div
        className="bg-gray-900/90 mb-10 rounded-2xl shadow-2xl p-8 w-full max-w-2xl flex flex-col items-center gap-6 border-4"
        style={{ borderColor: "#38b6ff" }}
      >
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Join a Room</h1>
        <button
          className="bg-white text-black font-extrabold py-4 px-10 rounded-full shadow transition mb-1 text-2xl border"
          style={{ borderColor: "#38b6ff" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#d6f3ff")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
          onClick={() => {
            const available = instances.find((i) => i.users.length < 5 && i.type === "public");
            if (available) {
              joinInstance(available.id);
            } else {
              createInstance("public");
            }
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
          className="bg-white text-gray-700 px-4 py-2 rounded-full font-medium transition mt-1 text-base border"
          style={{ borderColor: "#38b6ff" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#d6f3ff")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
          onClick={() => createInstance("private")}
        >
          Create Private Room
        </button>
      </div>
    </div>
  );
}
