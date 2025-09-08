import { initializeApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);
// Basic, non-sensitive init logging
try {
  // Avoid logging secrets; only log identifiers
  console.log("[Firebase] App initialized", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
  });
} catch {}
const auth = getAuth(app);

// Ensure Firebase auth persists across page reloads
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence)
    .then(() => {
      console.log("[Firebase] Auth persistence set: browserLocalPersistence");
    })
    .catch((error) => {
      console.error("[Firebase] Failed to set persistence:", error);
    });
}

const db = getFirestore(app);
const rtdb = getDatabase(app);

export { app, auth, db, rtdb };
