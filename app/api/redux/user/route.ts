import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { first_name, last_name } = body;

    // Parse the display name into first and last name
    const updateData: { first_name?: string; last_name?: string } = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined && last_name !== null) updateData.last_name = last_name;

    const updatedUser = await prisma.user.update({
      where: {
        auth_id: firebaseUid,
      },
      data: updateData,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        profile_image: true,
      },
    });

    return NextResponse.json({
      user_id: updatedUser.id,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      email: updatedUser.email,
      profile_image: updatedUser.profile_image,
    });
  } catch (error) {
    console.error("Error updating user data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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

    const user = await prisma.user.findUnique({
      where: {
        auth_id: firebaseUid,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        profile_image: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          user_id: null,
          first_name: null,
          last_name: null,
          email: null,
          profile_image: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      user_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      profile_image: user.profile_image,
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
