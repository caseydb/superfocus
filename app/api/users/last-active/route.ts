import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { userIds } = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ message: "userIds array is required" }, { status: 400 });
    }

    // Fetch last_active for all requested users
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: userIds
        }
      },
      select: {
        id: true,
        auth_id: true,
        last_active: true,
        first_name: true,
        last_name: true,
        profile_image: true
      }
    });

    // Create a map for easy lookup
    const userLastActiveMap: Record<string, { 
      last_active: string; 
      auth_id: string;
      first_name: string;
      last_name: string;
      profile_image: string | null;
    }> = {};
    
    users.forEach(user => {
      userLastActiveMap[user.id] = {
        last_active: user.last_active.toISOString(),
        auth_id: user.auth_id,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_image: user.profile_image
      };
    });

    return NextResponse.json(userLastActiveMap);
  } catch (error) {
    console.error("[users/last-active] Error:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}