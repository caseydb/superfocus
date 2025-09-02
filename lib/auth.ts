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
import LocalTaskCache from "@/app/utils/localTaskCache";
import LocalPreferencesCache from "@/app/utils/localPreferencesCache";

const googleProvider = new GoogleAuthProvider(); // Google SSO provider

// Helper to clear all guest caches when signing in
const clearGuestCaches = () => {
  LocalNotesCache.clearAll();
  LocalCounterCache.clearAllCounters();
  LocalTaskCache.clearAll();
  LocalPreferencesCache.clearPreferences();
};

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  // Clear guest caches when signing in
  clearGuestCaches();
  return result;
}; // Google login

export const signUpWithEmail = async (email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // Clear guest caches when signing up
  clearGuestCaches();
  return result;
}; // Email signup

export const signInWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  // Clear guest caches when signing in
  clearGuestCaches();
  return result;
}; // Email login

export const signOutUser = () => {
  // Clear cached user data when signing out
  if (typeof window !== 'undefined') {
    localStorage.removeItem('locked_in_user_name');
    localStorage.removeItem('guest_id');
    localStorage.removeItem('guest_avatar');
  }
  return signOut(auth);
}; // Logout

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email); // Password reset
