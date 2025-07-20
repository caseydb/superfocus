//Sync user to Postgres after login from Firebase

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const POST = async (req: NextRequest) => {
  // Check if Firebase Admin is properly configured
  if (!adminAuth) {
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
    } catch (dbError) {
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
