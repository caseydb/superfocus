import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// This endpoint fixes tasks with -1 order values
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    // Get all tasks for the user, ordered by created_at (oldest first)
    const tasks = await prisma.task.findMany({
      where: {
        user_id: user_id,
      },
      orderBy: {
        created_at: 'desc', // Newest first (they should be at the top)
      },
    });

    // Update each task with proper order value
    const updates = [];
    for (let i = 0; i < tasks.length; i++) {
      updates.push(
        prisma.task.update({
          where: { id: tasks[i].id },
          data: { order: i },
        })
      );
    }

    // Execute all updates in a transaction
    await prisma.$transaction(updates);

    return NextResponse.json({ 
      success: true, 
      message: `Fixed order for ${tasks.length} tasks`,
      tasksFixed: tasks.length
    });
  } catch (error) {
    console.error("Failed to fix task order:", error);
    return NextResponse.json(
      { 
        error: "Failed to fix task order",
        details: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    );
  }
}