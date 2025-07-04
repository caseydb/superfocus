// components/AuthForm.tsx
"use client";

import { useState } from "react";
import { signInWithGoogle, signUpWithEmail, signInWithEmail } from "@/lib/auth";
import Image from "next/image";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      setError(getErrorMessage(code) || (err as Error).message || "No account found with this email.");
    }
  };

  const firebaseErrorMessages: Record<string, string> = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password should be at least 6 characters.",
    // Add more as needed
  };

  const getErrorMessage = (errorCode: string) => {
    return firebaseErrorMessages[errorCode] || "No account found with this email.";
  };

  return (
    <div className="w-full max-w-sm bg-[#181A1B] rounded-xl shadow-xl p-6 flex flex-col items-center gap-4 border border-[#23272b] relative">
      <button
        onClick={() => handleAuth(signInWithGoogle)}
        className="w-full max-w-xs flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 px-6 bg-white text-gray-900 text-base font-semibold shadow-sm hover:border-[#FFAA00] transition mb-2"
      >
        <Image src="/google.png" alt="Google" width={24} height={24} className="mr-2" />
        Continue with Google
      </button>
      <div className="w-full flex items-center gap-2 my-1">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-gray-400 text-sm font-mono">or</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400 mb-1"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400 mb-2"
      />
      {error && <div className="w-full text-red-500 text-center font-mono text-sm mb-1">{error}</div>}
      <button
        onClick={() => handleAuth(() => signInWithEmail(email, password))}
        className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent mb-2"
      >
        Log In
      </button>
      <button
        onClick={() => handleAuth(() => signUpWithEmail(email, password))}
        className="w-full bg-transparent text-white font-bold text-base py-2 rounded-md shadow border border-[#FFAA00] hover:bg-[#23272b] transition"
      >
        Create Account
      </button>
    </div>
  );
}
