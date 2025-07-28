import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeFilter = searchParams.get('timeFilter') || 'all_time';
    
    // Get the start of the current week (Monday) if filtering by this week
    const monday = new Date();
    if (timeFilter === 'this_week') {
      const dayOfWeek = monday.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      monday.setDate(monday.getDate() - daysToMonday);
      monday.setHours(0, 0, 0, 0);
    }
    
    // Build the query based on the time filter
    const leaderboardData = timeFilter === 'this_week' 
      ? await prisma.$queryRaw`
          SELECT 
            u.id as user_id,
            u.first_name,
            u.last_name,
            u.profile_image,
            COALESCE(COUNT(DISTINCT t.id), 0)::int as total_tasks,
            COALESCE(SUM(t.duration), 0)::int as total_duration
          FROM 
            "user" u
          LEFT JOIN 
            "task" t ON u.id = t.user_id 
              AND t.status = 'completed'
              AND t.completed_at >= ${monday}
          GROUP BY 
            u.id, u.first_name, u.last_name, u.profile_image
          HAVING 
            COUNT(DISTINCT t.id) > 0 OR SUM(t.duration) > 0
          ORDER BY 
            COALESCE(SUM(t.duration), 0) DESC
        `
      : await prisma.$queryRaw`
          SELECT 
            u.id as user_id,
            u.first_name,
            u.last_name,
            u.profile_image,
            COALESCE(COUNT(DISTINCT t.id), 0)::int as total_tasks,
            COALESCE(SUM(t.duration), 0)::int as total_duration
          FROM 
            "user" u
          LEFT JOIN 
            "task" t ON u.id = t.user_id 
              AND t.status = 'completed'
          GROUP BY 
            u.id, u.first_name, u.last_name, u.profile_image
          HAVING 
            COUNT(DISTINCT t.id) > 0 OR SUM(t.duration) > 0
          ORDER BY 
            COALESCE(SUM(t.duration), 0) DESC
        `;


    // Transform the data to ensure proper types
    const formattedData = (leaderboardData as Array<{
      user_id: string;
      first_name: string;
      last_name: string;
      profile_image: string | null;
      total_tasks: number;
      total_duration: number;
    }>).map(entry => ({
      user_id: entry.user_id,
      first_name: entry.first_name,
      last_name: entry.last_name,
      profile_image: entry.profile_image,
      total_tasks: Number(entry.total_tasks),
      total_duration: Number(entry.total_duration)
    }));


    return NextResponse.json({ 
      success: true, 
      data: formattedData 
    });

  } catch (error) {
    console.error("[Leaderboard API] Error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}