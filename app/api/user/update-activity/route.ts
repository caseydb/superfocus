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

    // Update last_active to current time
    await prisma.user.update({
      where: {
        auth_id: firebaseUid,
      },
      data: {
        last_active: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/user/update-activity error:', error);
    // Silent fail - we don't want to break the app if activity tracking fails
    return NextResponse.json({ success: false }, { status: 200 });
  }
}