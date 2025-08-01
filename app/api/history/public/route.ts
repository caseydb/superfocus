import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required for public room history" },
        { status: 400 }
      );
    }

    // Get ALL completed tasks for the user across all rooms
    const completedTasks = await prisma.task.findMany({
      where: {
        user_id: userId,
        status: 'completed'
      },
      select: {
        id: true,
        task_name: true,
        duration: true,
        completed_at: true,
        room: {
          select: {
            slug: true
          }
        },
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true
          }
        }
      },
      orderBy: {
        completed_at: 'desc'
      }
    });

    // Format the response
    const history = completedTasks.map(task => ({
      id: task.id,
      userId: task.user.id,
      displayName: `${task.user.first_name} ${task.user.last_name}`.trim(),
      task: task.task_name,
      duration: task.duration,
      completedAt: task.completed_at,
      roomSlug: task.room.slug,
      formattedDuration: formatDuration(task.duration)
    }));

    return NextResponse.json({ 
      success: true, 
      history 
    });

  } catch (error) {
    console.error("[Public History API] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch public room history",
        details: process.env.NODE_ENV === "development" ? 
          (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}