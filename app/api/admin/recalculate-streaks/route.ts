import { NextResponse } from "next/server";
import { pool } from "@/utils/db";
import { rtdb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    // Get all users with their auth_id and timezone
    const usersQuery = `
      SELECT id, auth_id, timezone
      FROM users
      WHERE auth_id IS NOT NULL
    `;
    const usersResult = await pool.query(usersQuery);
    const users = usersResult.rows;

    console.log(`Processing streak calculation for ${users.length} users`);

    // Process each user
    const results = [];
    for (const user of users) {
      try {
        // Get all completed tasks for this user
        const tasksQuery = `
          SELECT name, created_at, completed_at, time_spent
          FROM tasks
          WHERE user_id = $1 AND status = 'completed'
          ORDER BY COALESCE(completed_at, created_at) ASC
        `;
        const tasksResult = await pool.query(tasksQuery, [user.id]);
        const tasks = tasksResult.rows;

        if (tasks.length === 0) {
          console.log(`User ${user.id} has no completed tasks`);
          continue;
        }

        // Calculate streak using the same logic as PersonalStats
        const streak = calculateStreak(tasks, user.timezone);

        // Push to Firebase RTDB
        if (streak > 0) {
          await rtdb.ref(`Streaks/${user.auth_id}`).set(streak);
          console.log(`Set streak ${streak} for user ${user.id} (auth_id: ${user.auth_id})`);
        } else {
          // Remove streak if it's 0
          await rtdb.ref(`Streaks/${user.auth_id}`).remove();
          console.log(`Removed streak for user ${user.id} (auth_id: ${user.auth_id})`);
        }

        results.push({
          userId: user.id,
          authId: user.auth_id,
          streak: streak,
          taskCount: tasks.length
        });
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        results.push({
          userId: user.id,
          authId: user.auth_id,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results: results
    });
  } catch (error) {
    console.error("Error recalculating streaks:", error);
    return NextResponse.json(
      { error: "Failed to recalculate streaks", details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to calculate streak (matching PersonalStats logic)
function calculateStreak(tasks: any[], userTimezone?: string): number {
  const getStreakDate = (timestamp: number) => {
    // Validate timestamp
    if (!timestamp || isNaN(timestamp)) {
      return "1970-01-01";
    }
    
    const date = new Date(timestamp);
    const timezone = userTimezone || 'UTC';
    
    // Create a proper date formatter for the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    // Get the parts
    const parts = formatter.formatToParts(date);
    const dateParts = parts.reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {} as Record<string, string>);
    
    // Extract values
    const year = dateParts.year;
    const month = dateParts.month;
    const day = dateParts.day;
    
    return `${year}-${month}-${day}`;
  };

  // Get unique streak dates
  const streakDates = tasks.map((task) => {
    const timestamp = task.completed_at ? new Date(task.completed_at).getTime() : new Date(task.created_at).getTime();
    return getStreakDate(timestamp);
  });

  const uniqueDateStrings = Array.from(new Set(streakDates));
  const sortedDateStrings = uniqueDateStrings.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  let currentStreak = 0;

  if (sortedDateStrings.length > 0) {
    // Calculate current streak (working backwards from today)
    const todayStr = getStreakDate(Date.now());
    const yesterdayStr = getStreakDate(Date.now() - 24 * 60 * 60 * 1000);

    const lastTaskDate = sortedDateStrings[sortedDateStrings.length - 1];

    // Check if the streak is current (task completed today or yesterday)
    if (lastTaskDate === todayStr || lastTaskDate === yesterdayStr) {
      currentStreak = 1;

      // Work backwards to count consecutive days
      for (let i = sortedDateStrings.length - 2; i >= 0; i--) {
        const prevDateStr = sortedDateStrings[i];
        const currDateStr = sortedDateStrings[i + 1];

        // Parse the date strings to get year, month, day
        const [prevYear, prevMonth, prevDay] = prevDateStr.split('-').map(Number);
        const [currYear, currMonth, currDay] = currDateStr.split('-').map(Number);
        
        // Create dates at noon to avoid any timezone edge cases
        const prevDate = new Date(prevYear, prevMonth - 1, prevDay, 12, 0, 0);
        const currDate = new Date(currYear, currMonth - 1, currDay, 12, 0, 0);
        
        // Check if dates are consecutive calendar days
        const nextDay = new Date(prevDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const isConsecutive = (
          nextDay.getFullYear() === currDate.getFullYear() &&
          nextDay.getMonth() === currDate.getMonth() &&
          nextDay.getDate() === currDate.getDate()
        );

        if (isConsecutive) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  return currentStreak;
}