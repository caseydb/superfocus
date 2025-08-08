// Sync team room to Postgres when created from Firebase

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

    const { roomSlug, roomName } = await req.json();
    
    if (!roomSlug) {
      console.error("[team-room-sync] Missing room slug");
      return NextResponse.json({ error: "Missing room slug" }, { status: 400 });
    }

    // Check if slug is already taken in PostgreSQL
    const existingRoom = await prisma.room.findUnique({
      where: { slug: roomSlug }
    });
    if (existingRoom) {
      return NextResponse.json({ error: "Room URL already taken" }, { status: 409 });
    }

    // Get the PostgreSQL user ID from Firebase auth ID
    const pgUser = await prisma.user.findUnique({
      where: { auth_id: uid }
    });

    if (!pgUser) {
      console.error("User not found in database with auth_id:", uid);
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    // Create room in PostgreSQL with type = 'private' for teams
    const pgRoom = await prisma.room.create({
      data: {
        name: roomName || roomSlug, // Use provided name or fall back to slug
        slug: roomSlug,
        picture: "/default-room-avatar.png", // Default room picture
        owner: pgUser.id,
        created_at: new Date(),
        type: "private" // Teams are always private
      }
    });

    // Add the creator as an admin member of the team room
    await prisma.room_member.create({
      data: {
        room_id: pgRoom.id,
        user_id: pgUser.id,
        role: "admin"
      }
    });

    // Return the room with a note that firebase_id will be updated separately
    return NextResponse.json({ 
      status: "ok", 
      room: pgRoom,
      message: "Team room created and creator added as admin. Firebase ID will be linked after Firebase RTDB creation."
    });
  } catch (error) {
    console.error("Error creating team room in PostgreSQL:", error);
    return NextResponse.json(
      {
        error: "Failed to create team room",
        details:
          process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
};