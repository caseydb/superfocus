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
        toggle_pomodoro_overtime: true,
        sound_volume: true,
        task_selection_mode: true,
        focus_check_time: true,
        date_picker: true,
        mode: true,
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

    // Update preferences
    const updatedPreferences = await prisma.preference.update({
      where: { user_id: userId },
      data: updates,
      select: {
        toggle_notes: true,
        toggle_pomodoro: true,
        toggle_pomodoro_overtime: true,
        sound_volume: true,
        task_selection_mode: true,
        focus_check_time: true,
        date_picker: true,
        mode: true,
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