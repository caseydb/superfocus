// components/SignIn.tsx
"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase"; // adjust path if needed

export default function SignIn() {
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      console.log("✅ Logged in");
    } catch (err) {
      console.error("❌ Login failed", err);
    }
  };

  return (
    <button
      className="bg-black text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition"
      onClick={handleGoogleLogin}
    >
      Sign in with Google
    </button>
  );
}
