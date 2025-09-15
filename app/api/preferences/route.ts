import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Fetch preferences for the user
    const preferences = await prisma.preference.findUnique({
      where: { user_id: userId },
      select: {
        toggle_notes: true,
        toggle_pomodoro: true,
        pomodoro_duration: true,
        sound_volume: true,
        task_selection_mode: true,
        focus_check_time: true,
        analytics_date_pick: true,
        analytics_overview: true,
        history_user_filter: true,
        history_date_filter: true,
        weekly_analytics_email: true,
        weekly_leaderboard_email: true,
        mode: true,
        paused_flash: true,
        theme: true,
      }
    });

    if (!preferences) {
      return NextResponse.json(
        { error: "Preferences not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    console.error("[Preferences API] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch preferences",
        details: process.env.NODE_ENV === "development" ? 
          (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, ...updates } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userExists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if preferences exist
    const existingPreferences = await prisma.preference.findUnique({
      where: { user_id: userId }
    });

    if (!existingPreferences) {
      // Create preferences if they don't exist
      const newPreferences = await prisma.preference.create({
        data: {
          user_id: userId,
          ...updates
        },
        select: {
          toggle_notes: true,
          toggle_pomodoro: true,
          pomodoro_duration: true,
          sound_volume: true,
          task_selection_mode: true,
          focus_check_time: true,
          analytics_date_pick: true,
          analytics_overview: true,
          history_user_filter: true,
          history_date_filter: true,
          weekly_analytics_email: true,
          weekly_leaderboard_email: true,
          mode: true,
          paused_flash: true,
          theme: true,
        }
      });
      return NextResponse.json({ success: true, preferences: newPreferences });
    }

    // Update preferences
    const updatedPreferences = await prisma.preference.update({
      where: { user_id: userId },
      data: updates,
      select: {
        toggle_notes: true,
        toggle_pomodoro: true,
        pomodoro_duration: true,
        sound_volume: true,
        task_selection_mode: true,
        focus_check_time: true,
        analytics_date_pick: true,
        analytics_overview: true,
        history_user_filter: true,
        history_date_filter: true,
        weekly_analytics_email: true,
        weekly_leaderboard_email: true,
        mode: true,
        paused_flash: true,
        theme: true,
      }
    });

    return NextResponse.json({ success: true, preferences: updatedPreferences });
  } catch (error) {
    console.error("[Preferences API] Update error:", error);
    return NextResponse.json(
      { 
        error: "Failed to update preferences",
        details: process.env.NODE_ENV === "development" ? 
          (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}
