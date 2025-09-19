import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import type { Database } from "firebase-admin/database";

// Initialize Firebase Admin if not already initialized and credentials are available
if (!getApps().length) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("Firebase Admin SDK environment variables missing:");
    console.error("FIREBASE_PROJECT_ID:", !!process.env.FIREBASE_PROJECT_ID);
    console.error("FIREBASE_CLIENT_EMAIL:", !!process.env.FIREBASE_CLIENT_EMAIL);
    console.error("FIREBASE_PRIVATE_KEY:", !!process.env.FIREBASE_PRIVATE_KEY);
  } else {
    try {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
        databaseURL:
          process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      });
      console.log("Firebase Admin SDK initialized successfully");
    } catch (error) {
      console.error("Firebase Admin initialization error:", error);
      console.error("Error details:", error instanceof Error ? error.message : error);
    }
  }
}

export const adminAuth = process.env.FIREBASE_PROJECT_ID ? getAuth() : null;

let cachedDb: Database | null = null;

export const adminDb = process.env.FIREBASE_PROJECT_ID
  ? (() => {
      if (!cachedDb) {
        try {
          cachedDb = getDatabase();
        } catch (error) {
          console.error("Firebase Admin RTDB initialization error:", error);
          cachedDb = null;
        }
      }
      return cachedDb;
    })()
  : null;

export const getAdminDb = () => {
  if (!process.env.FIREBASE_PROJECT_ID) {
    return null;
  }
  if (!cachedDb) {
    try {
      cachedDb = getDatabase();
    } catch (error) {
      console.error("Firebase Admin RTDB initialization error:", error);
      cachedDb = null;
    }
  }
  return cachedDb;
};
