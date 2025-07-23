import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Slug is required" 
        },
        { status: 400 }
      );
    }

    // Find room by slug
    const room = await prisma.room.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true
      }
    });

    if (!room) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Room not found" 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      room 
    });

  } catch (error) {
    console.error("[Room by slug API] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}