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
    console.log("[Preferences API] PATCH request body:", body);
    
    const { userId, ...updates } = body;
    console.log("[Preferences API] UserId:", userId);
    console.log("[Preferences API] Updates to apply:", updates);
    console.log("[Preferences API] Update types:", Object.entries(updates).map(([key, value]) => `${key}: ${typeof value} (${value})`));

    if (!userId) {
      console.error("[Preferences API] No userId provided");
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId }
    });
    console.log("[Preferences API] User exists:", !!userExists);

    if (!userExists) {
      console.error("[Preferences API] User not found:", userId);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if preferences exist
    const existingPreferences = await prisma.preference.findUnique({
      where: { user_id: userId }
    });
    console.log("[Preferences API] Existing preferences found:", !!existingPreferences);

    if (!existingPreferences) {
      console.log("[Preferences API] Creating new preferences for user:", userId);
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
          toggle_pomodoro_overtime: true,
          sound_volume: true,
          task_selection_mode: true,
          focus_check_time: true,
          date_picker: true,
          mode: true,
        }
      });
      console.log("[Preferences API] Created new preferences:", newPreferences);
      return NextResponse.json({ success: true, preferences: newPreferences });
    }

    // Update preferences
    console.log("[Preferences API] Updating existing preferences");
    const updatedPreferences = await prisma.preference.update({
      where: { user_id: userId },
      data: updates,
      select: {
        toggle_notes: true,
        toggle_pomodoro: true,
        pomodoro_duration: true,
        toggle_pomodoro_overtime: true,
        sound_volume: true,
        task_selection_mode: true,
        focus_check_time: true,
        date_picker: true,
        mode: true,
      }
    });
    console.log("[Preferences API] Updated preferences:", updatedPreferences);

    return NextResponse.json({ success: true, preferences: updatedPreferences });
  } catch (error) {
    console.error("[Preferences API] Update error - Full error object:", error);
    console.error("[Preferences API] Error type:", error?.constructor?.name);
    if (error instanceof Error) {
      console.error("[Preferences API] Error message:", error.message);
      console.error("[Preferences API] Error stack:", error.stack);
    }
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