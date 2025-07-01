// app/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAWpcQ9BFYkfoxEe8l4dBplugmqC30gGD0",
  authDomain: "locked-in-app-895c9.firebaseapp.com",
  databaseURL: "https://locked-in-app-895c9-default-rtdb.firebaseio.com",
  projectId: "locked-in-app-895c9",
  storageBucket: "locked-in-app-895c9.appspot.com",
  messagingSenderId: "1004021659302",
  appId: "1:1004021659302:web:828ba9967e319ed102e667",
  measurementId: "G-GQR8Z7GRDB",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = getDatabase(app);
