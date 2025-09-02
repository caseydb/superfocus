import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];

    if (!adminAuth) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const firebaseUid = decodedToken.uid;

    // Check if user exists first (guest users won't exist in PostgreSQL)
    const user = await prisma.user.findUnique({
      where: {
        auth_id: firebaseUid,
      },
    });

    if (!user) {
      // User doesn't exist in PostgreSQL (likely a guest user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update first_visit to false
    await prisma.user.update({
      where: {
        auth_id: firebaseUid,
      },
      data: {
        first_visit: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/user/first-visit error:', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}