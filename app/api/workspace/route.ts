import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ message: "userId is required" }, { status: 400 });
    }

    // Fetch rooms based on visibility rules:
    // - All public rooms
    // - Private rooms only where the user is a member
    const allRooms = await prisma.room.findMany({
      where: {
        OR: [
          { type: 'public' },
          {
            type: 'private',
            room_members: {
              some: {
                user_id: userId
              }
            }
          }
        ]
      },
      include: {
        room_members: {
          include: {
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    // Calculate stats for each room
    const roomStats: Record<string, { totalTime: string; totalTasks: number; activeUsers: number }> = {};
    const rooms = await Promise.all(
      allRooms.map(async (room): Promise<{
        id: string;
        firebase_id?: string;
        firebaseId?: string;
        name: string;
        slug: string;
        picture: string | null;
        type: 'public' | 'private';
        description?: string;
        url: string;
        members: { id: string; name: string; avatar: string; status: 'offline'; task: null }[];
        activeCount: number;
        weeklyStats: { totalTime: string; totalTasks: number };
        createdBy: string;
        isPinned: boolean;
        isOwner: boolean;
        isAdmin: boolean;
        admins: string[];
        maxMembers: number;
        isMember: boolean;
      }> => {
        // Check if the current user is a member of this room
        const userMembership = room.room_members.find(rm => rm.user_id === userId);
        
        // Get monthly stats (last 30 days)
        const monthStart = new Date();
        monthStart.setDate(monthStart.getDate() - 30);
        
        const monthlyTasks = await prisma.task.findMany({
          where: {
            room_id: room.id,
            created_at: {
              gte: monthStart,
            },
          },
          select: {
            duration: true,
            status: true,
          },
        });

        const totalMonthlyTime = monthlyTasks.reduce((sum, task) => sum + task.duration, 0);
        const totalMonthlyTasks = monthlyTasks.filter(task => task.status === 'completed').length;

        roomStats[room.id] = {
          totalTime: formatDuration(totalMonthlyTime),
          totalTasks: totalMonthlyTasks,
          activeUsers: 0, // Will be updated from Firebase
        };

        return {
          id: room.id,
          firebase_id: room.firebase_id || undefined,
          firebaseId: room.firebase_id || undefined,
          name: room.name,
          slug: room.slug,
          picture: room.picture,
          type: room.type as 'public' | 'private',
          description: room.description || undefined,
          url: `/${room.slug}`,
          members: room.room_members.map(rm => ({
            id: rm.user.id,
            name: `${rm.user.first_name} ${rm.user.last_name}`.trim(),
            avatar: 'XY', // Hardcoded for now
            status: 'offline' as const,
            task: null,
          })),
          activeCount: 0, // Will be updated from Firebase
          weeklyStats: {
            totalTime: formatDuration(totalMonthlyTime),
            totalTasks: totalMonthlyTasks,
          },
          createdBy: room.owner,
          isPinned: false, // Not stored in database currently
          isOwner: room.owner === userId,
          isAdmin: userMembership?.role === 'admin' || room.owner === userId,
          admins: room.room_members
            .filter(rm => rm.role === 'admin' || rm.user_id === room.owner)
            .map(rm => rm.user_id),
          maxMembers: 50,
          isMember: !!userMembership,
        };
      })
    );

    return NextResponse.json({
      rooms,
      roomStats,
    });
  } catch (error) {
    console.error("[workspace] Error:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}