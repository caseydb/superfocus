//Sync user to Postgres after login from Firebase

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const POST = async (req: NextRequest) => {
  console.log("🔍 Sync-user endpoint called");
  
  // Check if Firebase Admin is properly configured
  if (!adminAuth) {
    console.error("❌ Firebase Admin not configured");
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
  }

  const idToken = req.headers.get("Authorization")?.split("Bearer ")[1];
  if (!idToken) {
    console.error("❌ Missing token in sync-user");
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    console.log("🔍 Verifying ID token...");
    const decoded = await adminAuth.verifyIdToken(idToken);

    const { uid, email, name, picture } = decoded;
    console.log("🔍 Decoded token data:", { uid, email, name, picture });

    console.log("🔍 Attempting to upsert user to PostgreSQL...");
    const user = await prisma.user.upsert({
      where: { auth_id: uid },
      update: {
        last_active: new Date(),
      },
      create: {
        auth_id: uid,
        email: email || "",
        first_name: name?.split(" ")[0] || "",
        last_name: name?.split(" ").slice(1).join(" ") || "",
        profile_image: picture || "",
        last_active: new Date(),
      },
    });

    console.log("✅ User synced:", { uid, email, userId: user.id });
    return NextResponse.json({ status: "ok", user });
  } catch (error) {
    console.error("❌ Error in sync-user:", error);
    return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
  }
};
