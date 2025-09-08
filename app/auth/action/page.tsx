"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from "firebase/auth";

function EmailActionHandler() {
  const params = useSearchParams();
  // no router needed; we use hard redirects via window.location

  const mode = params.get("mode");
  const oobCode = params.get("oobCode") || "";

  const [status, setStatus] = useState<
    | { state: "loading" }
    | { state: "reset_form"; email: string }
    | { state: "success"; message: string }
    | { state: "error"; message: string }
  >({ state: "loading" });

  const isReset = mode === "resetPassword";
  const isVerifyEmail = mode === "verifyEmail";

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!oobCode) {
        setStatus({ state: "error", message: "Invalid or missing action code." });
        return;
      }

      try {
        if (isReset) {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (!mounted) return;
          setStatus({ state: "reset_form", email });
          return;
        }
        if (isVerifyEmail) {
          await applyActionCode(auth, oobCode);
          if (!mounted) return;
          setStatus({ state: "success", message: "Email verified. You can close this tab." });
          return;
        }
        setStatus({ state: "error", message: "Unsupported action." });
      } catch {
        setStatus({ state: "error", message: "This link is invalid or has expired." });
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [isReset, isVerifyEmail, oobCode]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = useMemo(() => password.length >= 6 && password === confirm, [password, confirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus({ state: "success", message: "Password changed. You can now sign in with your new password." });
    } catch {
      setStatus({ state: "error", message: "Failed to set new password. Try requesting another reset link." });
    } finally {
      setSubmitting(false);
    }
  };

  const onContinue = () => {
    // Always redirect to the root of superfocus.work
    const target = 'https://superfocus.work/';
    // Use hard redirect to ensure crossing origins works reliably
    if (typeof window !== 'undefined') {
      window.location.href = target;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-elegant-dark text-white px-4">
      <div className="bg-[#0E1119]/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800 relative">
        {/* Brand badge */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-[#FFAA00]/20 rounded-full flex items-center justify-center animate-pulse overflow-hidden">
              <div className="text-[#FFAA00] font-extrabold uppercase tracking-widest leading-none text-[9px] select-none">
                SUPERFOCUS
              </div>
            </div>
          </div>
        </div>

        {status.state === "loading" && (
          <div className="text-center text-gray-300">Loading…</div>
        )}

        {status.state === "reset_form" && (
          <>
            <h1 className="text-2xl font-black text-white text-center mb-2">Reset your password</h1>
            <p className="text-gray-400 text-sm text-center mb-6">for {status.email}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                placeholder="New password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-2 rounded-md bg-[#23272b] text-white border border-[#23272b] focus:border-[#FFAA00] outline-none font-mono text-base transition placeholder-gray-400"
              />
              <button
                disabled={!canSubmit || submitting}
                className={`w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow transition border border-transparent cursor-pointer ${
                  !canSubmit || submitting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#FFB84D]'
                }`}
              >
                {submitting ? 'Updating…' : 'Set new password'}
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="w-full bg-transparent text-white font-bold text-base py-2 rounded-md shadow border border-[#FFAA00] hover:bg-[#23272b] transition cursor-pointer"
              >
                Back to Superfocus
              </button>
            </form>
          </>
        )}

        {status.state === "success" && (
          <>
            <h1 className="text-2xl font-black text-white text-center mb-2">All set</h1>
            <p className="text-gray-300 text-center mb-6">{status.message}</p>
            <button
              onClick={onContinue}
              className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent cursor-pointer"
            >
              Continue to Superfocus
            </button>
          </>
        )}

        {status.state === "error" && (
          <>
            <h1 className="text-2xl font-black text-white text-center mb-2">Link problem</h1>
            <p className="text-gray-300 text-center mb-6">{status.message}</p>
            <button
              onClick={onContinue}
              className="w-full bg-[#FFAA00] text-black font-bold text-base py-2 rounded-md shadow hover:bg-[#FFB84D] transition border border-transparent cursor-pointer"
            >
              Return to Superfocus
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function EmailActionHandlerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark text-white px-4">
        <div className="text-center text-gray-300">Loading…</div>
      </div>
    }>
      <EmailActionHandler />
    </Suspense>
  );
}