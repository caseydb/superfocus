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
  console.log("[Milestones Check API] Request received", {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    timestamp: new Date().toISOString()
  });

  try {
    const userIdHeader = request.headers.get("x-user-id");
    console.log("[Milestones Check API] User ID header:", {
      hasUserIdHeader: !!userIdHeader,
      userId: userIdHeader
    });

    if (!userIdHeader) {
      console.error("[Milestones Check API] Missing user ID header");
      return NextResponse.json({ success: false, error: "Missing user ID" }, { status: 400 });
    }

    const userId = userIdHeader;
    
    // Get user by PostgreSQL user_id
    console.log("[Milestones Check API] Looking up user with user_id:", userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    console.log("[Milestones Check API] User lookup result:", {
      found: !!user,
      userId: user?.id,
      userName: user ? `${user.first_name} ${user.last_name}` : null
    });

    if (!user) {
      console.error("[Milestones Check API] User not found for user_id:", userId);
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

    console.log("[Milestones Check API] User stats:", {
      totalTasks,
      totalDuration,
      totalHours
    });

    // Check which milestones are crossed but not shown
    const unshownMilestones = [];
    console.log("[Milestones Check API] Checking milestones...");
    
    for (const milestone of MILESTONE_PRIORITY) {
      console.log(`[Milestones Check API] Checking milestone: ${milestone.type}`);
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

      console.log(`[Milestones Check API] Milestone ${milestone.type} shown status:`, {
        shown: !!shown,
        shownAt: shown?.shown_at
      });

      if (!shown) {
        console.log(`[Milestones Check API] Adding unshown milestone: ${milestone.type}`);
        unshownMilestones.push(milestone);
      }
    }

    // Return ONLY the first unshown milestone (priority order)
    const nextMilestone = unshownMilestones[0];

    console.log("[Milestones Check API] Final result:", {
      totalUnshownMilestones: unshownMilestones.length,
      nextMilestone: nextMilestone?.type,
      shouldShowPopup: unshownMilestones.length > 0
    });

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

    console.log("[Milestones Check API] Sending response:", response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Milestones Check API] Error - Full details:", error);
    console.error("[Milestones Check API] Error stack:", error instanceof Error ? error.stack : "No stack");
    
    const errorResponse = {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    
    console.error("[Milestones Check API] Sending error response:", errorResponse);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}