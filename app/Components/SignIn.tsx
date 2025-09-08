// components/AuthForm.tsx
"use client";

import { useState } from "react";
import { signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword } from "@/lib/auth";
import Image from "next/image";

export default function SignIn({ onSuccess }: { onSuccess?: (mode: 'login' | 'signup') => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  // Note: User sync to PostgreSQL is now handled in redux-initializer.tsx
  // This component only handles the sign-in UI

  const handleAuth = async (fn: () => Promise<unknown>, mode: 'login' | 'signup') => {
    setError(null);
    try {
      await fn();
      // Immediately close the modal
      if (onSuccess) onSuccess(mode);
      // Notify RoomShell to show welcome popup for signups
      if (mode === 'signup' && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('showWelcomePopup', { detail: {} }));
        } catch {}
      }
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
    "auth/missing-email": "Please enter an email address.",
    "auth/user-disabled": "This account has been disabled.",
    // Add more as needed
  };

  const getErrorMessage = (errorCode: string) => {
    return firebaseErrorMessages[errorCode] || "No account found with this email.";
  };

  const handlePasswordReset = async () => {
    setError(null);
    setResetSuccess(false);

    if (!resetEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }

    try {
      await resetPassword(resetEmail);
      setResetSuccess(true);
      setError(null);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || "";
      setError(getErrorMessage(code) || (err as Error).message || "Failed to send reset email.");
    }
  };

  return (
    <div className="w-full max-w-sm bg-[#181A1B] rounded-xl shadow-xl p-6 flex flex-col items-center gap-4 border border-[#23272b] relative">
      {!showResetPassword ? (
        <>
          <button
            onClick={() => handleAuth(signInWithGoogle, 'login')}
            className="w-full max-w-xs flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-3 px-6 bg-white text-gray-900 text-base font-semibold shadow-sm hover:border-[#FFAA00] transition mb-2 cursor-pointer"
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
            className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400"
          />
          <button
            onClick={() => {
              setShowResetPassword(true);
              setResetEmail(email);
              setError(null);
            }}
            className="w-full text-[#FFAA00] text-sm font-mono hover:underline text-left mb-2 cursor-pointer"
          >
            Forgot password?
          </button>
          {error && <div className="w-full text-red-500 text-center font-mono text-sm mb-1">{error}</div>}
          <button
            onClick={() => handleAuth(() => signInWithEmail(email, password), 'login')}
            className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent mb-2 cursor-pointer"
          >
            Log In
          </button>
          <button
            onClick={() => handleAuth(() => signUpWithEmail(email, password), 'signup')}
            className="w-full bg-transparent text-white font-bold text-base py-2 rounded-md shadow border border-[#FFAA00] hover:bg-[#23272b] transition cursor-pointer"
          >
            Create Account
          </button>
        </>
      ) : (
        <>
          <h2 className="text-white text-xl font-bold mb-2">Reset Password</h2>
          <p className="text-gray-400 text-sm font-mono text-center mb-4">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>
          <input
            type="email"
            placeholder="Email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400 mb-2"
          />
          {error && <div className="w-full text-red-500 text-center font-mono text-sm mb-1">{error}</div>}
          {resetSuccess && (
            <div className="w-full text-green-500 text-center font-mono text-sm mb-1">
              Password reset email sent! Check your inbox.
            </div>
          )}
          <button
            onClick={handlePasswordReset}
            className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent mb-2 cursor-pointer"
          >
            Send Reset Email
          </button>
          <button
            onClick={() => {
              setShowResetPassword(false);
              setResetSuccess(false);
              setError(null);
              setResetEmail("");
            }}
            className="w-full text-[#FFAA00] text-sm font-mono hover:underline cursor-pointer"
          >
            Back to Sign In
          </button>
        </>
      )}
    </div>
  );
}
