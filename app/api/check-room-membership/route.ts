import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const roomSlug = searchParams.get("roomSlug");

    if (!userId || !roomSlug) {
      return NextResponse.json({ message: "userId and roomSlug are required" }, { status: 400 });
    }

    // Check if the room exists and if the user is a member
    const room = await prisma.room.findUnique({
      where: { slug: roomSlug },
      include: {
        room_members: {
          where: {
            user_id: userId
          }
        }
      }
    });

    if (!room) {
      return NextResponse.json({ isMember: false, roomExists: false });
    }

    const isMember = room.room_members.length > 0;
    const memberRole = isMember ? room.room_members[0].role : null;

    return NextResponse.json({ 
      isMember, 
      roomExists: true,
      roomType: room.type,
      memberRole 
    });
  } catch (error) {
    console.error("[check-room-membership] Error:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}