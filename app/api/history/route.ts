import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');
    const userId = searchParams.get('userId');

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

    // Get completed tasks
    let completedTasks;
    
    if (userId) {
      // If userId is provided, get ALL their tasks across all rooms
      completedTasks = await prisma.task.findMany({
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
    } else {
      // Get all completed tasks from the room first
      const allTasks = await prisma.task.findMany({
        where: {
          room_id: room.id,
          status: 'completed'
        },
        select: {
          id: true,
          task_name: true,
          duration: true,
          completed_at: true,
          user_id: true,
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

      // Get user preferences for filtering
      const userIds = [...new Set(allTasks.map(t => t.user_id))];
      const preferences = await prisma.preference.findMany({
        where: {
          user_id: { in: userIds }
        },
        select: {
          user_id: true,
          history_user_filter: true
        }
      });

      // Create a map of user preferences
      const userPrefsMap = new Map(preferences.map(p => [p.user_id, p.history_user_filter]));

      // Show all tasks but mask task names for users with 'my_tasks' preference
      completedTasks = allTasks.map(task => {
        const pref = userPrefsMap.get(task.user_id);
        // If user has 'my_tasks' preference, hide their task name
        if (pref === 'my_tasks') {
          return {
            ...task,
            task_name: 'Successfully completed a task'
          };
        }
        return task;
      });
    }

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
    console.error("[History API] Full Error:", error);
    console.error("[History API] Error Message:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && 'code' in error) {
      console.error("[History API] Error Code:", (error as unknown as { code: string }).code);
    }
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