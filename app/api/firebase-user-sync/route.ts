//Sync user to Postgres after login from Firebase

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const POST = async (req: NextRequest) => {
  console.log("[API /firebase-user-sync] Sync request received");
  
  // Check if Firebase Admin is properly configured
  if (!adminAuth) {
    console.error(
      "[API /firebase-user-sync] Firebase Admin not configured. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables."
    );
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("Authorization");
  const idToken = authHeader?.split("Bearer ")[1];
  if (!idToken) {
    console.error("[API /firebase-user-sync] Missing token");
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  try {
    console.log("[API /firebase-user-sync] Verifying ID token");
    const decoded = await adminAuth.verifyIdToken(idToken);
    const { uid, email, name, picture } = decoded;
    
    console.log("[API /firebase-user-sync] Token verified:", {
      uid,
      email,
      name,
      hasPicture: !!picture
    });

    let user;
    try {

      // Extract first name with email fallback and capitalize first letter
      const rawFirstName = name?.split(" ")[0] || email?.split("@")[0] || "";
      const firstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);

      console.log("[API /firebase-user-sync] Upserting user with auth_id:", uid);
      user = await prisma.user.upsert({
        where: { auth_id: uid },
        update: {
          last_active: new Date(),
        },
        create: {
          auth_id: uid,
          email: email || "",
          first_name: firstName,
          last_name: name?.split(" ").slice(1).join(" ") || "",
          profile_image: picture || "",
          last_active: new Date(),
        },
      });
      
      console.log("[API /firebase-user-sync] User upserted:", {
        user_id: user.id,
        auth_id: user.auth_id,
        email: user.email,
        first_name: user.first_name
      });

      // Create preferences if they don't exist (for new users or existing users without preferences)
      const existingPreferences = await prisma.preference.findUnique({
        where: { user_id: user.id },
      });

      if (!existingPreferences) {
        await prisma.preference.create({
          data: {
            user_id: user.id,
            // All other fields will use their defaults from the schema
          },
        });
      }
    } catch (dbError) {
      console.error("Database error in firebase-user-sync:", dbError);
      console.error("DATABASE_URL exists:", !!process.env.DATABASE_URL);
      throw dbError;
    }

    console.log("[API /firebase-user-sync] Sync successful, returning user");
    return NextResponse.json({ status: "ok", user });
  } catch (error) {
    console.error("[API /firebase-user-sync] Error syncing user:", error);
    if (error instanceof Error) {
      console.error("[API /firebase-user-sync] Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json(
      {
        error: "Failed to sync user",
        details:
          process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
      { status: 500 }
    );
  }
};
