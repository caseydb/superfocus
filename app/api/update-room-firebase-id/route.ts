// Update the firebase_id for a room after Firebase RTDB creation

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const POST = async (req: NextRequest) => {
  // Check if Firebase Admin is properly configured
  if (!adminAuth) {
    console.error(
      "Firebase Admin not configured. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables."
    );
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("Authorization");
  const idToken = authHeader?.split("Bearer ")[1];
  if (!idToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid } = decoded;

    const { roomId, firebaseId } = await req.json();
    
    if (!roomId || !firebaseId) {
      return NextResponse.json({ error: "Missing room ID or Firebase ID" }, { status: 400 });
    }

    // Get the PostgreSQL user ID from Firebase auth ID
    const pgUser = await prisma.user.findUnique({
      where: { auth_id: uid }
    });

    if (!pgUser) {
      console.error("User not found in database with auth_id:", uid);
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    // Update the room with firebase_id
    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: { firebase_id: firebaseId }
    });

    return NextResponse.json({ 
      status: "ok", 
      room: updatedRoom 
    });
  } catch (error) {
    console.error("Error updating room firebase_id:", error);
    return NextResponse.json(
      {
        error: "Failed to update room",
        details:
          process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
};