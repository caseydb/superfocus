import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates } = body;

    // Validate input
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid updates array" },
        { status: 400 }
      );
    }

    // Validate each update has required fields
    for (const update of updates) {
      if (!update.taskId || typeof update.order !== 'number') {
        return NextResponse.json(
          { error: "Each update must have taskId and order" },
          { status: 400 }
        );
      }
    }

    // Update all tasks in a transaction
    const updatePromises = updates.map(({ taskId, order }: { taskId: string; order: number }) =>
      prisma.task.update({
        where: { id: taskId },
        data: { order },
      })
    );

    await prisma.$transaction(updatePromises);

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error("[Task Reorder API] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to reorder tasks",
        details: process.env.NODE_ENV === "development" ? 
          (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}