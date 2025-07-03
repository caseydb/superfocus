"use client";

import { useInstance } from "../Components/Instances";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SignOut from "./SignOut";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import SignInEmail from "./SignInEmail";
import { signInWithGoogle } from "@/lib/auth";
import Image from "next/image";

export default function Lobby() {
  const { instances, currentInstance, joinInstance, createInstance, leaveInstance } = useInstance();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

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
      {signedIn && (
        <div className="fixed top-6 right-8 z-50">
          <SignOut />
        </div>
      )}
      <div className="w-full flex flex-col items-center mb-10 mt-2">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2 drop-shadow-lg">
          Drop In. Lock In. Get Sh*t Done.
        </h1>
        <p className="text-lg md:text-2xl text-gray-300 text-center max-w-2xl mx-auto opacity-90 font-medium">
          Level up your work with others in the zone.
        </p>
      </div>
      {!signedIn && (
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={() => signInWithGoogle()}
            className="w-full max-w-xs flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 px-6 bg-white text-gray-900 text-lg font-medium shadow-sm hover:border-[#00b4ff] transition"
          >
            <Image src="/google.png" alt="Google" width={24} height={24} className="mr-2" />
            Continue with Google
          </button>
          <div className="mt-4 text-gray-300 text-base">
            Don&apos;t have an account?{" "}
            <button
              className="font-bold underline underline-offset-2 hover:text-[#00b4ff] transition"
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
            <SignInEmail />
          </div>
        </div>
      )}
      <div
        className={`bg-gray-900/90 mb-10 rounded-2xl shadow-2xl p-8 w-full max-w-2xl flex flex-col items-center gap-6 border-4 transition-all duration-200 ${
          !signedIn ? "opacity-40 pointer-events-none grayscale" : ""
        }`}
        style={{ borderColor: "#00b4ff" }}
      >
        <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">Join a Room</h1>
        <button
          className="bg-white text-black font-extrabold py-4 px-10 rounded-full shadow transition mb-1 text-2xl border"
          style={{ borderColor: "#00b4ff" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#00b4ff")}
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
          style={{ borderColor: "#00b4ff" }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#00b4ff")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "")}
          onClick={() => createInstance("private")}
        >
          Create Private Room
        </button>
      </div>
    </div>
  );
}
