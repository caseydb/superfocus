//Sync user to Postgres after login from Firebase

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
    const { uid, email, name, picture } = decoded;

    let user;
    try {

      user = await prisma.user.upsert({
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

    return NextResponse.json({ status: "ok", user });
  } catch (error) {
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
