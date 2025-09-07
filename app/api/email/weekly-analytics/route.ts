import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
// Firebase RTDB no longer used for streaks

// Hardcoded target users for testing as requested (structured for many)
const TARGET_USER_IDS: string[] = [
  "df3aed2a-ad51-457f-b0cd-f7d4225143d4",
  "6e756c03-9596-41bc-96ae-d8ede249a27a",
];

// Format seconds into human-friendly Hh Mm format
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST() {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_ADDRESS = process.env.RESEND_FROM || "Superfocus Analytics <analytics@superfocus.work>";
    if (!RESEND_API_KEY) {
      return NextResponse.json({ success: false, error: "RESEND_API_KEY not configured" }, { status: 500 });
    }

    // Compute Monday start (UTC) and weekly leaderboard once
    const monday = new Date();
    const nowUTC = new Date(Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate(),
      monday.getUTCHours(),
      monday.getUTCMinutes(),
      monday.getUTCSeconds()
    ));
    const dayOfWeek = nowUTC.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setUTCDate(nowUTC.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);

    const weeklyLeaderboard = await prisma.$queryRaw<Array<{
      user_id: string;
      total_duration: number;
      total_tasks: number;
      first_name: string;
      last_name: string;
    }>>`
      SELECT 
        u.id as user_id,
        u.first_name,
        u.last_name,
        COALESCE(COUNT(DISTINCT t.id), 0)::int as total_tasks,
        COALESCE(SUM(t.duration), 0)::int as total_duration
      FROM 
        "user" u
      LEFT JOIN 
        "task" t ON u.id = t.user_id 
          AND t.status = 'completed'
          AND t.completed_at >= ${monday}
      GROUP BY 
        u.id, u.first_name, u.last_name
      HAVING 
        COUNT(DISTINCT t.id) > 0 OR SUM(t.duration) > 0
      ORDER BY 
        COALESCE(SUM(t.duration), 0) DESC
    `;

    const results: Array<{ userId: string; email?: string | null; sent: boolean; error?: string } > = [];

    for (const userId of TARGET_USER_IDS) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, first_name: true, last_name: true, streak: true }
      });

      if (!user || !user.email) {
        results.push({ userId, sent: false, error: "Target user or email not found" });
        continue;
      }

      // Calculate 7-day window (including today)
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      // Query completed tasks in last 7 days for this user
      const tasks = await prisma.task.findMany({
        where: { user_id: user.id, status: 'completed', completed_at: { gte: start } },
        select: { id: true, duration: true, completed_at: true, task_name: true },
        orderBy: { completed_at: 'desc' }
      });

      const totalTasks = tasks.length;
      const totalSeconds = tasks.reduce((sum, t) => sum + (t.duration || 0), 0);

      // Day summary for last 7 days
      const dayMap = new Map<string, { tasks: number; seconds: number }>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dayMap.set(toISODate(d), { tasks: 0, seconds: 0 });
      }
      tasks.forEach(t => {
        const completedAt = t.completed_at ?? new Date();
        const dayKey = toISODate(new Date(completedAt));
        const entry = dayMap.get(dayKey);
        if (entry) { entry.tasks += 1; entry.seconds += t.duration || 0; }
      });
      const dayRows = Array.from(dayMap.entries()).map(([date, stats]) => ({ date, tasks: stats.tasks, seconds: stats.seconds }));
      const activeDays = dayRows.filter(r => r.seconds > 0).length;
      const avgPerDaySeconds = activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0;

      // Locate user's rank and neighbors for visual
      const rankIndex = weeklyLeaderboard.findIndex(e => e.user_id === user.id);
      const weeklyRank = rankIndex >= 0 ? rankIndex + 1 : null;
      let visualStart = 0;
      if (rankIndex >= 0) visualStart = Math.max(0, rankIndex - 2);
      const visualEnd = Math.min(weeklyLeaderboard.length - 1, visualStart + 4);
      if (rankIndex >= 0 && visualEnd - visualStart < 4) visualStart = Math.max(0, visualEnd - 4);
      const visualGroup = weeklyLeaderboard.slice(visualStart, visualEnd + 1).map((e, i) => ({ ...e, rank: visualStart + i + 1, isUser: e.user_id === user.id }));

      // Streak: read from Postgres user.streak to match Redux value
      const streak = Number(user.streak || 0);

      // Compose email
      const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Your";
      const firstName = (user.first_name ?? fullName.split(" ")[0] ?? "You").trim();
      const prettyTotal = formatDuration(totalSeconds);
      const prettyAvgDay = formatDuration(avgPerDaySeconds);

      const leaderboardVisualHtml = visualGroup.length > 0 ? `
      <table role="presentation" width="100%" style="margin-top:12px;border-collapse:separate;border-spacing:0 8px;">
        ${visualGroup.map(v => `
          <tr>
            <td style="padding:0;">
              <div style="border:1px solid ${v.isUser ? '#FFAA00' : '#1f2937'};background:#0E1119;border-radius:12px;padding:12px;">
                <table role="presentation" width="100%" style="border-collapse:collapse;">
                  <tr style="height:24px;">
                    <td style="vertical-align:middle;width:36px;text-align:left;font-size:${v.isUser ? '14px' : '13px'};line-height:1.4;color:${v.isUser ? '#FFAA00' : '#9ca3af'};font-weight:700;">#${v.rank}</td>
                    <td style="vertical-align:middle;color:#e5e7eb;font-size:${v.isUser ? '14px' : '13px'};line-height:1.4;font-weight:${v.isUser ? '800' : '600'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(v.first_name || '').toString()} ${(v.last_name || '').toString()}</td>
                    <td style="vertical-align:middle;text-align:right;white-space:nowrap;font-size:${v.isUser ? '14px' : '13px'};line-height:1.4;color:${v.isUser ? '#FFAA00' : '#9ca3af'};font-weight:${v.isUser ? '800' : '700'};">${formatDuration(Number(v.total_duration) || 0)}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
        `).join('')}
      </table>
    ` : '';

      // Header subtitle logic: if user has 0 tasks this week, show a friendly nudge
      const headerSubtitle = totalTasks === 0
        ? `We missed you! Let’s get you back on 🔥`
        : `Leaderboard Rank: <span style="color:#FFAA00;font-weight:700">${weeklyRank ? `#${weeklyRank}` : 'Unranked'}</span>
            ${streak >= 1 
              ? `<span style=\"color:#374151\"> | </span><span style=\"color:#e5e7eb;font-weight:700\">${streak}</span> <span style=\"color:#9ca3af\">Day Streak</span> 🔥`
              : `<span style=\"color:#374151\"> | </span> You Worked <span style=\"color:#e5e7eb;font-weight:700\">${activeDays}</span> Days 🔥`}`;

      const html = `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <title>Performance Snapshot: Last 7 Days</title>
          <style>
            @media only screen and (max-width: 480px) {
              .wrapper-pad { padding: 0 !important; }
              .container-pad { padding: 0 !important; max-width: 100% !important; }
              /* Keep rounded corners on mobile too */
              .card-edge { border-radius: 16px !important; border: 0 !important; }
              /* Stack KPI cards on small screens */
              .kpi-table tr { display: block !important; }
              .kpi-table { border-spacing: 0 12px !important; }
              .kpi-table .kpi-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; margin: 0 0 12px 0 !important; padding: 16px !important; }
              /* Remove outer side gaps entirely */
              .side-gap { display: none !important; width: 0 !important; }
            }
            /* Neutralize iOS auto-detected links (addresses, phones) */
            a[x-apple-data-detectors],
            .unstyle-auto-detected-links a,
            #sf-address a {
              color: inherit !important;
              text-decoration: none !important;
              pointer-events: none !important;
              cursor: default !important;
              font-size: inherit !important;
              font-family: inherit !important;
              font-weight: inherit !important;
              line-height: inherit !important;
            }
          </style>
        </head>
        <body style="margin:0;background:#FFFFFF;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
          <table role="presentation" width="100%" class="wrapper-pad" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:24px 0;">
            <tr>
              <td class="side-gap" />
              <td style="max-width:640px;margin:0 auto;display:block;padding:0 20px;" class="container-pad">
                <table role="presentation" width="100%" class="card-edge" style="background:#0B0E16;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
                  <tr>
                    <td style="padding:28px 28px 20px;background:linear-gradient(180deg,#111827 0%,#0B0E16 100%);text-align:center;border-bottom:1px solid #1f2937;">
                      <div style="font-size:14px;color:#9ca3af;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;">Superfocus</div>
                      <div style="font-size:22px;font-weight:800;background:linear-gradient(90deg,#FFAA00,#ffb833);-webkit-background-clip:text;background-clip:text;color:transparent;">${firstName}'s Analytics</div>
                      <div style="margin-top:6px;color:#9ca3af;font-size:13px;text-align:center;">${headerSubtitle}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 28px;">
                      <div style="font-size:16px;margin-bottom:14px;color:#e5e7eb;text-align:center;">"Small deeds done are better than great deeds planned."
                        <div style="margin-top:4px;color:#9ca3af;font-size:14px;">Peter Marshall</div>
                      </div>
                      <table role="presentation" width="100%" class="kpi-table" style="border-collapse:separate;border-spacing:12px 12px;">
                        <tr>
                          <td class="kpi-cell" style="width:33.33%;padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Total Time</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${prettyTotal}</div>
                          </td>
                          <td class="kpi-cell" style="width:33.33%;padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Tasks</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${totalTasks}</div>
                          </td>
                          <td class="kpi-cell" style="width:33.33%;padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Avg Time/Day</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${prettyAvgDay}</div>
                          </td>
                        </tr>
                      </table>
                      ${leaderboardVisualHtml}
                      <div style="height:12px"></div>
                      <div style="text-align:center;margin-top:8px;">
                        <a href="https://superfocus.work/" target="_blank" style="
                          display:inline-block;
                          padding:14px 24px;
                          background:#0E1119;
                          background: linear-gradient(180deg, #111827 0%, #0B0E16 100%);
                          color:#FFFFFF;
                          font-weight:800;
                          letter-spacing:.02em;
                          border-radius:9999px;
                          text-decoration:none;
                          border:1px solid #FFAA00;
                          box-shadow: 0 0 0 2px rgba(255,170,0,0.12), 0 10px 28px rgba(255,170,0,0.25);
                        ">Enter Superfocus</a>
                      </div>

                    </td>
                  </tr>
                </table>
                <div style="text-align:center;color:#6b7280;font-size:12px;margin-top:14px;" class="unstyle-auto-detected-links" id="sf-address">
                  <span style="color:#6b7280;text-decoration:none;">701 Brazos Street, Austin, Texas 78701</span>
                </div>
                <div style="text-align:center;color:#6b7280;font-size:12px;margin-top:6px;">
                  <a href="https://superfocus.work/?modal=preferences" target="_blank" style="color:#6b7280;text-decoration:underline;">Manage preferences</a>
                </div>
              </td>
              <td class="side-gap" />
            </tr>
          </table>
        </body>
      </html>
    `;
      // Send via Resend API
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_ADDRESS, to: [user.email], subject: "Performance Snapshot: Last 7 Days", html }),
        });
        const rawText = await res.text();
        let json: unknown = {}; try { json = rawText ? JSON.parse(rawText) as unknown : {}; } catch {}
        if (!res.ok) {
          let friendly = "Failed to send email";
          const apiMsg = (() => {
            if (typeof json === 'object' && json !== null) {
              const obj = json as Record<string, unknown>;
              const top = obj.message;
              if (typeof top === 'string') return top;
              const err = obj.error as unknown;
              if (typeof err === 'string') return err;
              if (typeof err === 'object' && err !== null) {
                const msg = (err as Record<string, unknown>).message;
                if (typeof msg === 'string') return msg;
              }
            }
            return rawText;
          })();
          if (res.status === 401 || res.status === 403) friendly = "Invalid or unauthorized RESEND_API_KEY";
          if (res.status === 422 && typeof apiMsg === 'string' && apiMsg.toLowerCase().includes('from')) friendly = "Invalid 'from' address. Use a verified domain or onboarding@resend.dev";
          results.push({ userId: user.id, email: user.email, sent: false, error: friendly });
        } else {
          results.push({ userId: user.id, email: user.email, sent: true });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ userId: user.id, email: user.email, sent: false, error: message });
      }
    }

    const sentCount = results.filter(r => r.sent).length;
    return NextResponse.json({ success: sentCount > 0, sentCount, total: results.length, results });
  } catch (error) {
    console.error("[weekly-analytics email]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
