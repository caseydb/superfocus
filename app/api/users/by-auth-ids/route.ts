import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { authIds } = await request.json();
    
    if (!authIds || !Array.isArray(authIds)) {
      return NextResponse.json({ error: "Invalid authIds array" }, { status: 400 });
    }

    // Fetch users by auth_ids
    const users = await prisma.user.findMany({
      where: {
        auth_id: {
          in: authIds
        }
      },
      select: {
        auth_id: true,
        first_name: true,
        last_name: true,
        profile_image: true
      }
    });

    // Create a map for easy lookup
    const userMap = users.reduce((acc, user) => {
      acc[user.auth_id] = {
        firstName: user.first_name,
        lastName: user.last_name,
        profileImage: user.profile_image
      };
      return acc;
    }, {} as Record<string, { firstName: string; lastName: string; profileImage: string | null }>);

    return NextResponse.json({ success: true, users: userMap });
  } catch (error) {
    console.error('[users/by-auth-ids] Error:', error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}