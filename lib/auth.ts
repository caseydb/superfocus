// lib/auth.ts

import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "./firebase"; // uses your initialized auth instance
import LocalNotesCache from "@/app/utils/localNotesCache";
import LocalCounterCache from "@/app/utils/localCounterCache";
import { LocalTaskCache } from "@/app/utils/localTaskCache";
import LocalPreferencesCache from "@/app/utils/localPreferencesCache";

const googleProvider = new GoogleAuthProvider(); // Google SSO provider

// Helper to clear all guest caches when signing in
const clearGuestCaches = () => {
  console.log("[Auth] Clearing all guest caches");
  LocalNotesCache.clearAll();
  LocalCounterCache.clearAllCounters();
  LocalTaskCache.clearCache();
  LocalPreferencesCache.clearPreferences();
  console.log("[Auth] Guest caches cleared");
};

export const signInWithGoogle = async () => {
  // Mark that we're attempting real authentication to prevent anonymous sign-in
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('pendingAuth', 'true');
  }
  
  // Get the old anonymous UID before signing in
  const oldUid = auth.currentUser?.uid;
  const wasAnonymous = auth.currentUser?.isAnonymous;
  
  console.log("[Auth] ===== GOOGLE SIGN IN STARTED =====", { 
    oldUid, 
    wasAnonymous,
    timestamp: new Date().toISOString()
  });
  
  const result = await signInWithPopup(auth, googleProvider);
  
  console.log("[Auth] Google sign in successful:", {
    newUid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName,
    isAnonymous: result.user.isAnonymous
  });
  
  // Clear the pending auth flag after successful authentication
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('pendingAuth');
  }
  
  // If we were anonymous and now have a different UID, clean up old presence
  if (wasAnonymous && oldUid && result.user.uid !== oldUid) {
    console.log("[Auth] Cleaning up old anonymous presence:", oldUid);
    const { rtdb } = await import("../lib/firebase");
    const { ref, remove } = await import("firebase/database");
    
    // Remove old presence data
    const oldPresenceRef = ref(rtdb, `Presence/${oldUid}`);
    await remove(oldPresenceRef).catch(() => {});
    
    // Remove old task buffer
    const oldTaskBufferRef = ref(rtdb, `TaskBuffer/${oldUid}`);
    await remove(oldTaskBufferRef).catch(() => {});
    
    // Note: Room index cleanup would need to iterate through rooms
    // For now, the presence cleanup handles this
    console.log("[Auth] Old anonymous user cleaned up");
  }
  
  // Clear guest caches when signing in
  clearGuestCaches();
  return result;
}; // Google login

export const signUpWithEmail = async (email: string, password: string) => {
  // Mark that we're attempting real authentication to prevent anonymous sign-in
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('pendingAuth', 'true');
  }
  
  console.log("[Auth] ===== EMAIL SIGN UP STARTED =====", {
    email,
    timestamp: new Date().toISOString()
  });
  
  const result = await createUserWithEmailAndPassword(auth, email, password);
  
  console.log("[Auth] Email sign up successful:", {
    uid: result.user.uid,
    email: result.user.email
  });
  
  // Clear the pending auth flag after successful authentication
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('pendingAuth');
  }
  
  // Clear guest caches when signing up
  clearGuestCaches();
  return result;
}; // Email signup

export const signInWithEmail = async (email: string, password: string) => {
  // Mark that we're attempting real authentication to prevent anonymous sign-in
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('pendingAuth', 'true');
  }
  
  console.log("[Auth] ===== EMAIL SIGN IN STARTED =====", {
    email,
    currentUser: auth.currentUser?.uid,
    timestamp: new Date().toISOString()
  });
  
  const result = await signInWithEmailAndPassword(auth, email, password);
  
  console.log("[Auth] Email sign in successful:", {
    uid: result.user.uid,
    email: result.user.email,
    displayName: result.user.displayName
  });
  
  // Clear the pending auth flag after successful authentication
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('pendingAuth');
  }
  
  // Clear guest caches when signing in
  clearGuestCaches();
  return result;
}; // Email login

export const signOutUser = () => {
  console.log("[Auth] ===== SIGN OUT STARTED =====", {
    currentUser: auth.currentUser?.uid,
    email: auth.currentUser?.email,
    timestamp: new Date().toISOString()
  });
  
  // Clear cached user data when signing out
  if (typeof window !== 'undefined') {
    console.log("[Auth] Clearing localStorage items");
    localStorage.removeItem('locked_in_user_name');
    localStorage.removeItem('guest_id');
    localStorage.removeItem('guest_avatar');
    localStorage.removeItem('firebase_token');
    // Ensure we don't suppress anonymous auth after logout
    try {
      sessionStorage.removeItem('pendingAuth');
    } catch {}
    console.log("[Auth] localStorage cleared");
  }
  
  const signOutPromise = signOut(auth);
  
  signOutPromise.then(() => {
    console.log("[Auth] Sign out successful");
  }).catch((error) => {
    console.error("[Auth] Sign out error:", error);
  });
  
  return signOutPromise;
}; // Logout

export const resetPassword = (email: string) => {
  // Send a password reset that lands on our branded handler page.
  // Prefer a fixed public URL so emails always link to production.
  const base = process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'https://superfocus.work');
  const actionCodeSettings = {
    url: `${base}/`,
    handleCodeInApp: true,
  } as const;
  return sendPasswordResetEmail(auth, email, actionCodeSettings);
}; // Password reset
