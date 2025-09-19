import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

type RoomIndexEntry = {
  isActive?: boolean;
  lastUpdated?: number | object;
  joinedAt?: number | object;
  currentTaskName?: string | null;
};

type FirebaseUserEntry = {
  firstName?: string;
  lastName?: string;
  picture?: string | null;
};

type PresenceRouteParams = {
  roomId: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<PresenceRouteParams> }
) {
  const { roomId: roomIdRaw } = await context.params;
  const roomId = decodeURIComponent(roomIdRaw ?? "").trim();

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
  }

  try {
    const roomSnapshot = await db.ref(`RoomIndex/${roomId}`).get();

    if (!roomSnapshot.exists()) {
      return NextResponse.json({
        roomId,
        users: [],
        summary: { total: 0, active: 0 },
      });
    }

    const roomData = roomSnapshot.val() as Record<string, RoomIndexEntry>;
    const userIds = Object.keys(roomData);

    if (userIds.length === 0) {
      return NextResponse.json({
        roomId,
        users: [],
        summary: { total: 0, active: 0 },
      });
    }

    const [firebaseEntries, postgresUsers] = await Promise.all([
      Promise.all(
        userIds.map(async (userId) => {
          try {
            const userSnap = await db.ref(`Users/${userId}`).get();
            if (userSnap.exists()) {
              return { id: userId, data: userSnap.val() as FirebaseUserEntry };
            }
          } catch (error) {
            console.error("[presence proxy] Failed to read Firebase Users entry", { userId, error });
          }
          return { id: userId, data: null };
        })
      ),
      prisma.user.findMany({
        where: {
          auth_id: {
            in: userIds,
          },
        },
        select: {
          auth_id: true,
          first_name: true,
          last_name: true,
          profile_image: true,
          linkedin_url: true,
        },
      }),
    ]);

    const firebaseMap = firebaseEntries.reduce<Record<string, FirebaseUserEntry | null>>((acc, entry) => {
      acc[entry.id] = entry.data;
      return acc;
    }, {});

    const postgresMap = postgresUsers.reduce<
      Record<
        string,
        {
          firstName: string | null;
          lastName: string | null;
          profileImage: string | null;
          linkedinUrl: string | null;
        }
      >
    >((acc, user) => {
      acc[user.auth_id] = {
        firstName: user.first_name,
        lastName: user.last_name,
        profileImage: user.profile_image,
        linkedinUrl: user.linkedin_url,
      };
      return acc;
    }, {});

    const users = userIds.map((userId) => {
      const roomEntry = roomData[userId] || {};
      const firebaseUser = firebaseMap[userId];
      const postgresUser = postgresMap[userId];

      const firstName = postgresUser?.firstName ?? firebaseUser?.firstName ?? null;
      const lastName = postgresUser?.lastName ?? firebaseUser?.lastName ?? null;
      const profileImage = postgresUser?.profileImage ?? null;
      const firebasePicture = firebaseUser?.picture ?? null;
      const linkedinUrl = postgresUser?.linkedinUrl ?? null;

      return {
        id: userId,
        isActive: Boolean(roomEntry.isActive),
        lastUpdated: roomEntry.lastUpdated ?? null,
        joinedAt: roomEntry.joinedAt ?? null,
        currentTaskName: roomEntry.currentTaskName ?? null,
        firstName,
        lastName,
        profileImage,
        firebasePicture,
        linkedinUrl,
      };
    });

    const activeCount = users.filter((user) => user.isActive).length;

    return NextResponse.json({
      roomId,
      users,
      summary: {
        total: users.length,
        active: activeCount,
      },
    });
  } catch (error) {
    console.error("[presence proxy] Failed to load room presence", { roomId, error });
    return NextResponse.json({ error: "Failed to load room presence" }, { status: 500 });
  }
}
