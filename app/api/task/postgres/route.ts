import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, task_name, user_id, room_id, status, duration, completed_at } = body;

    console.log("Creating task with data:", {
      id,
      task_name,
      user_id,
      room_id,
      status,
      duration,
      completed_at
    });

    // Validate required fields
    if (!id || !task_name || !user_id || !room_id) {
      return NextResponse.json(
        { error: "Missing required fields: id, task_name, user_id, and room_id" },
        { status: 400 }
      );
    }

    // Try to find room by slug first (assuming room_id might be a slug)
    let room = await prisma.room.findUnique({
      where: { slug: room_id }
    });

    // If not found by slug, try by id
    if (!room) {
      room = await prisma.room.findUnique({
        where: { id: room_id }
      });
    }

    // If still not found, create a default room for this instance
    if (!room) {
      console.log(`Room not found with id/slug: ${room_id}, creating default room`);
      
      // Create a default room for this Firebase instance
      try {
        room = await prisma.room.create({
          data: {
            name: `Room ${room_id}`,
            slug: room_id, // Use the Firebase instance ID as slug
            picture: "/default-room.png",
            owner: user_id, // Use the user as owner
          }
        });
        console.log("Created default room:", room);
      } catch (createError) {
        console.error("Failed to create default room:", createError);
        return NextResponse.json(
          { error: `Failed to create room for instance: ${room_id}` },
          { status: 500 }
        );
      }
    }

    // Create task in database with the provided UUID
    const task = await prisma.task.create({
      data: {
        id, // Use the client-provided UUID
        task_name: task_name.trim(),
        user_id,
        room_id: room.id, // Use the actual room ID from database
        status: status || "not_started",
        duration: duration || 0,
        completed_at: completed_at ? new Date(completed_at) : null,
      }
    });


    return NextResponse.json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    // Return more detailed error in development
    const errorMessage = error instanceof Error ? error.message : "Failed to create task";
    return NextResponse.json(
      { 
        error: "Failed to create task",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id parameter" },
        { status: 400 }
      );
    }

    // Fetch all tasks for the user
    const tasks = await prisma.task.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: "desc"
      }
    });

    console.log(`[GET /api/task/postgres] Found ${tasks.length} tasks for user ${userId}`);
    if (tasks.length > 0) {
      console.log("[GET /api/task/postgres] Sample task:", tasks[0]);
    }

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[PATCH] Received body:", JSON.stringify(body, null, 2));
    const { id, updates } = body;

    if (!id || !updates) {
      console.error("[PATCH] Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields: id and updates" },
        { status: 400 }
      );
    }

    console.log("[PATCH] Updating task:", id);
    console.log("[PATCH] Updates:", updates);

    // Update task in database
    const task = await prisma.task.update({
      where: { id },
      data: updates,
    });

    console.log("[PATCH] Updated task:", task);
    return NextResponse.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("user_id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing task id" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id" },
        { status: 400 }
      );
    }

    // Verify the task belongs to the user before deleting
    const task = await prisma.task.findUnique({
      where: { id },
      select: { user_id: true }
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.user_id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized to delete this task" },
        { status: 403 }
      );
    }

    // Delete the task
    await prisma.task.delete({
      where: { id }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Task deleted successfully" 
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}