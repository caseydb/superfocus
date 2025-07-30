import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

const MILESTONE_PRIORITY = [
  { type: "5_tasks", threshold: 5, unit: "tasks" as const },
  { type: "5_hours", threshold: 5 * 3600, unit: "seconds" as const },
  // Future milestones can be added here
  // { type: "10_tasks", threshold: 10, unit: "tasks" as const },
  // { type: "10_hours", threshold: 10 * 3600, unit: "seconds" as const },
];

export async function GET(request: NextRequest) {
  try {
    const userIdHeader = request.headers.get("x-user-id");

    if (!userIdHeader) {
      return NextResponse.json({ success: false, error: "Missing user ID" }, { status: 400 });
    }

    const userId = userIdHeader;
    
    // Get user by PostgreSQL user_id
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Get user's total stats
    const stats = await prisma.task.aggregate({
      where: {
        user_id: user.id,
        status: "completed",
      },
      _count: {
        id: true,
      },
      _sum: {
        duration: true,
      },
    });

    const totalTasks = stats._count.id || 0;
    const totalDuration = stats._sum.duration || 0;
    const totalHours = totalDuration / 3600;

    // Check which milestones are crossed but not shown
    const unshownMilestones = [];
    
    for (const milestone of MILESTONE_PRIORITY) {
      // Check if milestone is crossed
      let crossed = false;
      if (milestone.unit === "tasks") {
        crossed = totalTasks >= milestone.threshold;
      } else if (milestone.unit === "seconds") {
        crossed = totalDuration >= milestone.threshold;
      }
      
      if (!crossed) continue;

      // Check if milestone message has been shown
      const shown = await prisma.user_milestone_messages.findUnique({
        where: {
          user_id_milestone_channel: {
            user_id: user.id,
            milestone: milestone.type,
            channel: "invite_popup",
          },
        },
      });

      if (!shown) {
        unshownMilestones.push(milestone);
      }
    }

    // Return ONLY the first unshown milestone (priority order)
    const nextMilestone = unshownMilestones[0];

    const response = {
      success: true,
      data: {
        shouldShowPopup: unshownMilestones.length > 0,
        milestone: nextMilestone?.type || null,
        stats: {
          totalTasks,
          totalHours,
          totalDuration,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}