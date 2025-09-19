import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SUPERADMIN_USER_ID = "df3aed2a-ad51-457f-b0cd-f7d4225143d4";

interface PublicRoomResponse {
  rooms: Array<{
    id: string;
    firebase_id?: string | null;
    firebaseId?: string | null;
    name: string;
    slug: string;
    picture: string | null;
    type: "public";
    description?: string | null;
    url: string;
    members: Array<{
      id: string;
      name: string;
      avatar: string;
      status: "offline";
      task: null;
      profileImage: string | null;
      firstName: string;
      lastName: string;
      authId: string | null;
    }>;
    activeCount: number;
    weeklyStats: {
      totalTime: string;
      totalTasks: number;
    };
    createdBy: string;
    isPinned: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    admins: string[];
    maxMembers: number;
    isMember: boolean;
  }>;
  roomStats: Record<
    string,
    {
      totalTime: string;
      totalTasks: number;
      activeUsers: number;
    }
  >;
}

export async function GET() {
  try {
    const monthStart = new Date();
    monthStart.setDate(monthStart.getDate() - 30);

    const publicRooms = await prisma.room.findMany({
      where: {
        type: "public",
      },
      include: {
        room_members: {
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                profile_image: true,
                auth_id: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: "asc",
      },
    });

    const roomIds = publicRooms.map((room) => room.id);

    const monthlyTasks = roomIds.length
      ? await prisma.task.findMany({
          where: {
            room_id: {
              in: roomIds,
            },
            created_at: {
              gte: monthStart,
            },
          },
          select: {
            room_id: true,
            duration: true,
            status: true,
          },
        })
      : [];

    const taskStats = new Map<
      string,
      {
        totalDuration: number;
        completedTasks: number;
      }
    >();

    for (const task of monthlyTasks) {
      if (!task.room_id) continue;
      const stats = taskStats.get(task.room_id) ?? { totalDuration: 0, completedTasks: 0 };
      stats.totalDuration += task.duration;
      if (task.status === "completed") {
        stats.completedTasks += 1;
      }
      taskStats.set(task.room_id, stats);
    }

    const roomStats: PublicRoomResponse["roomStats"] = {};

    const rooms: PublicRoomResponse["rooms"] = publicRooms.map((room) => {
      const stats = taskStats.get(room.id) ?? { totalDuration: 0, completedTasks: 0 };

      const members = room.room_members
        .filter((member) => member.user_id !== SUPERADMIN_USER_ID)
        .map((member) => ({
          id: member.user.id,
          name: `${member.user.first_name} ${member.user.last_name}`.trim(),
          avatar: "XY", // Placeholder avatar rendering matches workspace API
          status: "offline" as const,
          task: null,
          profileImage: member.user.profile_image,
          firstName: member.user.first_name,
          lastName: member.user.last_name,
          authId: member.user.auth_id,
        }));

      const totalTime = formatDuration(stats.totalDuration);
      const totalTasks = stats.completedTasks;

      roomStats[room.id] = {
        totalTime,
        totalTasks,
        activeUsers: 0,
      };

      return {
        id: room.id,
        firebase_id: room.firebase_id,
        firebaseId: room.firebase_id,
        name: room.name,
        slug: room.slug,
        picture: room.picture,
        type: "public" as const,
        description: room.description,
        url: `/${room.slug}`,
        members,
        activeCount: 0,
        weeklyStats: {
          totalTime,
          totalTasks,
        },
        createdBy: room.owner,
        isPinned: false,
        isOwner: false,
        isAdmin: false,
        admins: [],
        maxMembers: 50,
        isMember: false,
      };
    });

    const response: PublicRoomResponse = {
      rooms,
      roomStats,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[public-rooms] Error:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
