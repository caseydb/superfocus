import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, task_name, user_id, room_id, status, duration, completed_at, timezone } = body;

    // Validate required fields
    if (!id || !task_name || !user_id || !room_id) {
      return NextResponse.json(
        { error: "Missing required fields: id, task_name, user_id, and room_id" },
        { status: 400 }
      );
    }

    // Try to find room by slug first (assuming room_id might be a slug)
    let room = await prisma.room.findUnique({
      where: { slug: room_id },
    });

    // If not found by slug, try by id
    if (!room) {
      room = await prisma.room.findUnique({
        where: { id: room_id },
      });
    }

    // If still not found, create a default room for this instance
    if (!room) {
      // Create a default room for this Firebase instance
      try {
        room = await prisma.room.create({
          data: {
            name: `Room ${room_id}`,
            slug: room_id, // Use the Firebase instance ID as slug
            picture: "/default-room.png",
            owner: user_id, // Use the user as owner
          },
        });
      } catch {
        return NextResponse.json({ error: `Failed to create room for instance: ${room_id}` }, { status: 500 });
      }
    }

    // Create task in database with the provided UUID
    const task = await prisma.task.create({
      data: {
        id, // Use the client-provided UUID
        task_name: task_name.trim(),
        user: {
          connect: { id: user_id }
        },
        room: {
          connect: { id: room.id }
        },
        status: status || "not_started",
        duration: duration || 0,
        completed_at: completed_at ? new Date(completed_at) : null,
        timezone: timezone || "UTC",
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    // Return more detailed error in development
    const errorMessage = error instanceof Error ? error.message : "Failed to create task";
    return NextResponse.json(
      {
        error: "Failed to create task",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
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
      return NextResponse.json({ error: "Missing user_id parameter" }, { status: 400 });
    }

    // Fetch all tasks for the user
    const tasks = await prisma.task.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json({ error: "Missing required fields: id and updates" }, { status: 400 });
    }

    // Update task in database
    const task = await prisma.task.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("user_id");

    if (!id) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    // Verify the task belongs to the user before deleting
    const task = await prisma.task.findUnique({
      where: { id },
      select: { user_id: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorized to delete this task" }, { status: 403 });
    }

    // Delete the task
    await prisma.task.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
