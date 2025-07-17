// components/AuthForm.tsx
"use client";

import { useState, useEffect } from "react";
import { signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  // Auto-sync user to PostgreSQL when they sign in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log("🔍 Auth state changed, user:", user?.email || "no user");
      if (user) {
        console.log("🔍 User signed in, calling sync-user...");
        
        // First test if API routes work
        fetch("/api/test-sync", {
          method: "GET",
        }).then(res => res.json()).then(data => {
          console.log("🧪 Test endpoint response:", data);
        }).catch(err => {
          console.error("🧪 Test endpoint error:", err);
        });
        
        // User signed in - sync to PostgreSQL
        user.getIdToken().then((idToken) => {
          console.log("🔍 Got ID token, length:", idToken.length);
          fetch("/api/users/sync-user", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          })
            .then(async (response) => {
              if (response.ok) {
                const data = await response.json();
                console.log("✅ User synced to database", data);
              } else {
                const error = await response.text();
                console.error("❌ Failed to sync user to database:", response.status, error);
              }
            })
            .catch((error) => {
              console.error("❌ Error syncing user:", error);
            });
        });
      }
    });
    return () => unsub();
  }, []);

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
            className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400"
          />
          <button
            onClick={() => {
              setShowResetPassword(true);
              setResetEmail(email);
              setError(null);
            }}
            className="w-full text-[#FFAA00] text-sm font-mono hover:underline text-left mb-2"
          >
            Forgot password?
          </button>
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
            className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent mb-2"
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
            className="w-full text-[#FFAA00] text-sm font-mono hover:underline"
          >
            Back to Sign In
          </button>
        </>
      )}
    </div>
  );
}
