import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export async function PATCH(req: NextRequest) {
  try {
    // Check if Firebase Admin is properly configured
    if (!adminAuth) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
    }

    // Verify authentication
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1];
    if (!idToken) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);

    const body = await req.json();
    const { task_id, status } = body;

    // Validate required fields
    if (!task_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields: task_id and status" },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ["not_started", "in_progress", "paused", "completed", "quit"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Get the user by Firebase Auth ID
    const user = await prisma.user.findUnique({
      where: { auth_id: decoded.uid }
    });
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update task status - verify task belongs to user
    const task = await prisma.task.update({
      where: { 
        id: task_id,
        user_id: user.id // Ensure task belongs to this user
      },
      data: {
        status,
        updated_at: new Date()
      }
    });


    return NextResponse.json({
      id: task.id,
      status: task.status,
      updated_at: task.updated_at
    });
  } catch (error) {
    // Handle specific Prisma errors
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      return NextResponse.json(
        { error: "Task not found or access denied" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to update task status" },
      { status: 500 }
    );
  }
}