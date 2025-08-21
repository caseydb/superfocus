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
    const { taskId, counter } = body;

    if (!taskId || counter === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: taskId and counter" },
        { status: 400 }
      );
    }

    // Update the counter in the database
    const updatedTask = await prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        counter: counter,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task counter:", error);
    return NextResponse.json(
      { error: "Failed to update task counter" },
      { status: 500 }
    );
  }
}