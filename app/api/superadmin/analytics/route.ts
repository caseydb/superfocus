import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import prisma from "@/lib/prisma";

const SUPERADMIN_USER_ID = "df3aed2a-ad51-457f-b0cd-f7d4225143d4";

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized - No token provided" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];

    if (!adminAuth) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const firebaseUid = decodedToken.uid;

    // Get the user from the database
    const user = await prisma.user.findUnique({
      where: {
        auth_id: firebaseUid,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if the user is the superadmin
    if (user.id !== SUPERADMIN_USER_ID) {
      return NextResponse.json({ error: "Forbidden - Not authorized" }, { status: 403 });
    }

    // Get all users who have completed at least one task, including their timezone and completed tasks
    const usersWithCompletedTasks = await prisma.user.findMany({
      where: {
        tasks: {
          some: {
            status: "completed"
          }
        }
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        timezone: true,
        tasks: {
          where: {
            status: "completed"
          },
          select: {
            id: true,
            task_name: true,
            duration: true,
            timezone: true,
            completed_at: true,
            created_at: true,
            updated_at: true,
            status: true,
            order: true
          },
          orderBy: {
            completed_at: 'desc'
          }
        },
        _count: {
          select: {
            tasks: {
              where: {
                status: "completed"
              }
            }
          }
        }
      },
      orderBy: [
        { first_name: 'asc' },
        { last_name: 'asc' }
      ]
    });


    // Format the response to match Redux task structure
    const formattedUsers = usersWithCompletedTasks.map(user => ({
      id: user.id,
      first_name: user.first_name || "Unknown",
      last_name: user.last_name || "",
      email: user.email,
      timezone: user.timezone || null,
      completed_tasks_count: user._count.tasks,
      display_name: `${user.first_name || "Unknown"} ${user.last_name || ""}`.trim(),
      // Transform tasks to match Redux Task interface
      tasks: user.tasks.map(task => ({
        id: task.id,
        name: task.task_name, // Map task_name to name
        completed: task.status === "completed",
        timeSpent: task.duration || 0, // Map duration to timeSpent
        createdAt: new Date(task.created_at).getTime(),
        completedAt: task.completed_at ? new Date(task.completed_at).getTime() : undefined,
        lastActive: task.updated_at ? new Date(task.updated_at).getTime() : undefined,
        status: task.status as "completed", // All these tasks are completed
        order: task.order,
        // Task-specific timezone if needed
        timezone: task.timezone
      }))
    }));

    return NextResponse.json({
      users: formattedUsers,
      total_users: formattedUsers.length
    });

  } catch (error) {
    console.error('GET /api/superadmin/analytics error:', error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}