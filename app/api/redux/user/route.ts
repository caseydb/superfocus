import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import prisma from "@/lib/prisma";

function computeLongestStreakFromDays(dayStrings: string[]): number {
  if (!dayStrings || dayStrings.length === 0) return 0;
  const uniq = Array.from(new Set(dayStrings)).sort();
  const addOneDay = (ds: string) => {
    const [y, m, d] = ds.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  let longest = 1;
  let current = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === addOneDay(uniq[i - 1])) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

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
    const { first_name, last_name, timezone, profile_image, linkedin_url, streak } = body;

    // Build update data object
    const updateData: { first_name?: string; last_name?: string; timezone?: string; profile_image?: string; linkedin_url?: string; streak?: number } = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined && last_name !== null) updateData.last_name = last_name;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (profile_image !== undefined) updateData.profile_image = profile_image;
    if (linkedin_url !== undefined) updateData.linkedin_url = linkedin_url;
    if (streak !== undefined) updateData.streak = Number(streak);

    // If streak is being updated, also recompute longest_streak (handled below)

    // Ensure we have longest_streak when streak provided
    let longestToSet: number | undefined = undefined;
    if (streak !== undefined) {
      // fetch user id to query tasks by user_id
      const dbUser = await prisma.user.findUnique({ where: { auth_id: firebaseUid }, select: { id: true } });
      if (dbUser?.id) {
        const rows: Array<{ day: string }> = await prisma.$queryRawUnsafe(
          `SELECT DISTINCT to_char((completed_locally_at)::date, 'YYYY-MM-DD') AS day
           FROM "task" WHERE user_id = $1 AND status = 'completed' AND completed_locally_at IS NOT NULL`,
          dbUser.id
        );
        const dayStrings = rows.map(r => r.day);
        longestToSet = computeLongestStreakFromDays(dayStrings);
        // Enforce invariant: longest >= current streak being set
        if (typeof updateData.streak === 'number' && longestToSet < updateData.streak) {
          longestToSet = updateData.streak;
        }
      }
    }

    const updatedUser = await prisma.user.update({
      where: {
        auth_id: firebaseUid,
      },
      data: {
        ...updateData,
        ...(longestToSet !== undefined ? { longest_streak: longestToSet } : {}),
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        profile_image: true,
        linkedin_url: true,
        timezone: true,
        first_visit: true,
        streak: true,
      },
    });

    return NextResponse.json({
      user_id: updatedUser.id,
      auth_id: firebaseUid,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      email: updatedUser.email,
      profile_image: updatedUser.profile_image,
      linkedin_url: updatedUser.linkedin_url,
      timezone: updatedUser.timezone,
      streak: updatedUser.streak,
    });
  } catch (error) {
    console.error('[API /redux/user PATCH] Error:', error);
    if (error instanceof Error) {
      console.error('[API /redux/user PATCH] Error details:', {
        message: error.message,
        stack: error.stack
      });
    }
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
        linkedin_url: true,
        timezone: true,
        first_visit: true,
        streak: true,
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
          linkedin_url: null,
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
      linkedin_url: user.linkedin_url,
      timezone: user.timezone,
      first_visit: user.first_visit,
      streak: user.streak,
    });
  } catch (error) {
    console.error("[API /redux/user GET] Error fetching user:", error);
    if (error instanceof Error) {
      console.error("[API /redux/user GET] Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json({ error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
