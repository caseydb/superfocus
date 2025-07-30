import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const userIdHeader = request.headers.get("x-user-id");
    if (!userIdHeader) {
      return NextResponse.json({ success: false, error: "Missing user ID" }, { status: 400 });
    }

    const userId = userIdHeader;
    const body = await request.json();
    const { milestone, channel } = body;

    if (!milestone || !channel) {
      return NextResponse.json(
        { success: false, error: "Missing milestone or channel" },
        { status: 400 }
      );
    }

    // Get user by PostgreSQL user_id
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Create or update the milestone message record
    const milestoneMessage = await prisma.user_milestone_messages.upsert({
      where: {
        user_id_milestone_channel: {
          user_id: user.id,
          milestone,
          channel,
        },
      },
      update: {
        shown_at: new Date(),
      },
      create: {
        user_id: user.id,
        milestone,
        channel,
      },
    });

    return NextResponse.json({
      success: true,
      data: milestoneMessage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}