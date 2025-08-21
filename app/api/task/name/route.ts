import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    // Get the authorization token from headers
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, name } = body;

    if (!taskId || !name || !name.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: taskId and name" },
        { status: 400 }
      );
    }

    // Update the task name in the database
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        task_name: name.trim(),
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task name:", error);
    return NextResponse.json(
      { error: "Failed to update task name" },
      { status: 500 }
    );
  }
}