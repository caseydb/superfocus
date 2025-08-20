import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import prisma from "@/lib/prisma";

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
    const { first_name, last_name, timezone } = body;

    // Parse the display name into first and last name
    const updateData: { first_name?: string; last_name?: string; timezone?: string } = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined && last_name !== null) updateData.last_name = last_name;
    if (timezone !== undefined) updateData.timezone = timezone;

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
        timezone: true,
        first_visit: true,
      },
    });

    return NextResponse.json({
      user_id: updatedUser.id,
      auth_id: firebaseUid,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      email: updatedUser.email,
      profile_image: updatedUser.profile_image,
      timezone: updatedUser.timezone,
    });
  } catch (error) {
    console.error('PATCH /api/redux/user error:', error);
    return NextResponse.json({ error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
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
        timezone: true,
        first_visit: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          user_id: null,
          auth_id: null,
          first_name: null,
          last_name: null,
          email: null,
          profile_image: null,
          timezone: null,
          first_visit: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      user_id: user.id,
      auth_id: firebaseUid,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      profile_image: user.profile_image,
      timezone: user.timezone,
      first_visit: user.first_visit,
    });
  } catch (error) {
    console.error('GET /api/redux/user error:', error);
    return NextResponse.json({ error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
