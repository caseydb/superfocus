// lib/auth.ts

import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase"; // uses your initialized auth instance

const googleProvider = new GoogleAuthProvider(); // Google SSO provider

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider); // Google login

export const signUpWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password); // Email signup

export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password); // Email login

export const signOutUser = () => signOut(auth); // Logout
