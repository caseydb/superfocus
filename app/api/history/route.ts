import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { error: "Room slug is required" },
        { status: 400 }
      );
    }

    // First, get the room by slug
    const room = await prisma.room.findUnique({
      where: { slug },
      select: { id: true }
    });

    if (!room) {
      return NextResponse.json(
        { error: "Room not found" },
        { status: 404 }
      );
    }

    // Get all completed tasks for this room with user information
    const completedTasks = await prisma.task.findMany({
      where: {
        room_id: room.id,
        status: 'completed'
      },
      select: {
        id: true,
        task_name: true,
        duration: true,
        completed_at: true,
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
      // Format duration as mm:ss or hh:mm:ss
      formattedDuration: formatDuration(task.duration)
    }));

    return NextResponse.json({ 
      success: true, 
      history 
    });

  } catch (error) {
    console.error("[History API] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch history",
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