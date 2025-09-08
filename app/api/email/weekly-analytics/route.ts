import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
// Firebase RTDB no longer used for streaks

// Hardcoded target users for testing as requested (structured for many)
const TARGET_USER_IDS: string[] = [
  "df3aed2a-ad51-457f-b0cd-f7d4225143d4",
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

    // Simple rate limit + retry controls (match Lambda behavior)
    const RATE_LIMIT_PER_SEC = Number(process.env.RATE_LIMIT_PER_SEC || '3');
    const SEND_DELAY_MS = Math.max(0, Math.floor(1000 / Math.max(1, RATE_LIMIT_PER_SEC)));
    const RETRY_MAX = Number(process.env.RETRY_MAX || '3');
    const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || '1000');
    const JITTER_MS = Number(process.env.RETRY_JITTER_MS || '250');

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sendWithRetry = async (payload: { from: string; to: string[]; subject: string; html: string }) => {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const rawText = await res.text();
          let json: unknown = {}; try { json = rawText ? JSON.parse(rawText) : {}; } catch {}
          if (res.ok) return { ok: true, json };
          const status = res.status;
          let apiMsg: string | undefined;
          if (typeof json === 'object' && json !== null) {
            const obj = json as Record<string, unknown>;
            const top = obj.message;
            if (typeof top === 'string') apiMsg = top;
            const err = obj.error as unknown;
            if (typeof err === 'string') apiMsg = err;
            else if (typeof err === 'object' && err !== null) {
              const msg = (err as Record<string, unknown>).message;
              if (typeof msg === 'string') apiMsg = msg;
            }
          }
          apiMsg = apiMsg || rawText;
          const isRetryable = status === 429 || (status >= 500 && status < 600);
          if (attempt < RETRY_MAX && isRetryable) {
            const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * JITTER_MS);
            await sleep(backoff + jitter);
            continue;
          }
          return { ok: false, status, apiMsg };
        } catch (err: unknown) {
          if (attempt < RETRY_MAX) {
            const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * JITTER_MS);
            await sleep(backoff + jitter);
            continue;
          }
          const msg = err instanceof Error ? err.message : String(err);
          return { ok: false, status: 0, apiMsg: msg };
        }
      }
    };

    // Weekly leaderboard no longer needed for this email; removed query

    // Select a single quote for this send so all recipients see the same one
    let selectedQuote: { id: string; quote: string; author: string } | null = null;
    try {
      const q = await prisma.$queryRaw<Array<{ id: string; quote: string; author: string }>>`
        SELECT "id", "quote", "author" FROM "quote" WHERE "active" = true ORDER BY "lastUsedAt" NULLS FIRST, random() LIMIT 1
      `;
      if (q && q.length > 0) {
        selectedQuote = q[0];
        await prisma.$executeRaw`UPDATE "quote" SET "lastUsedAt" = now(), "timesUsed" = "timesUsed" + 1 WHERE "id" = ${selectedQuote.id}`;
      }
    } catch (e) {
      console.error('[weekly-analytics email] Quote selection failed:', e);
    }

    // Use a simple left quote glyph styled to be white, since React Icons can't be used in raw email HTML.
    // Use a stylized quote glyph for maximum email-client compatibility
    const quoteIcon = `<div style="font-size:24px;line-height:1;color:#ffffff;margin-bottom:8px;text-align:center;">❝</div>`;
    const quoteBlockHtml = selectedQuote ? `
      <div style="border:1px solid #1f2937;background:linear-gradient(180deg,#0E1119 0%,#0B0E16 100%);border-radius:12px;padding:16px 18px;text-align:center;margin-bottom:14px;">
        ${quoteIcon}
        <div style="font-size:16px;color:#e5e7eb;">${String(selectedQuote.quote || '')}</div>
        <div style="margin-top:8px;color:#9ca3af;font-size:14px;">${String(selectedQuote.author || '')}</div>
      </div>
    ` : `
      <div style="border:1px solid #1f2937;background:linear-gradient(180deg,#0E1119 0%,#0B0E16 100%);border-radius:12px;padding:16px 18px;text-align:center;margin-bottom:14px;">
        ${quoteIcon}
        <div style="font-size:16px;color:#e5e7eb;">Small deeds done are better than great deeds planned.</div>
        <div style="margin-top:8px;color:#9ca3af;font-size:14px;">Peter Marshall</div>
      </div>
    `;

    const results: Array<{ userId: string; email?: string | null; sent: boolean; error?: string } > = [];

    for (const userId of TARGET_USER_IDS) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, first_name: true, last_name: true, streak: true, timezone: true }
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

      // Leaderboard visuals removed in email; no need to compute rank window

      // Streak: read from Postgres user.streak to match Redux value
      const streak = Number(user.streak || 0);

      // Compose email
      const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Your";
      const firstName = (user.first_name ?? fullName.split(" ")[0] ?? "You").trim();
      const prettyTotal = formatDuration(totalSeconds);
      const prettyAvgDay = formatDuration(avgPerDaySeconds);
      const avgTasksPerDayRounded = Math.round(totalTasks / Math.max(1, activeDays));
      const avgTimePerTaskSeconds = Math.round(totalSeconds / Math.max(1, totalTasks));
      const prettyAvgTask = formatDuration(avgTimePerTaskSeconds);

      /* Upcoming/Completed sections commented out to keep only analytics
      // Build tasks sections to replace leaderboard visual
      const notStartedTasks = await prisma.task.findMany({ ... });
      const topCompleted = [...tasks] ...;
      const notStartedHtml = `...`;
      const completedHtml = `...`;
      const tasksSectionsHtml = `${notStartedHtml}${completedHtml}`;
      */
      const tasksSectionsHtml = '';

      // Header subtitle logic: remove leaderboard rank entirely
      const headerSubtitle = totalTasks === 0
        ? `We missed you! Let’s get you back on 🔥`
        : `${streak >= 1 
              ? `<span style="color:#e5e7eb;font-weight:700">${streak}</span> <span style="color:#9ca3af">Day Streak</span> 🔥`
              : `You Worked <span style=\"color:#e5e7eb;font-weight:700\">${activeDays}</span> Days 🔥`}`;

      // Quote is selected once per send (defined before loop)

      const html = `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <title>Focus Report: Last 7 Days</title>
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
              /* Slightly larger CTA spacing on small screens */
              .cta-gap { margin: 20px 0 !important; }
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
                      ${quoteBlockHtml}
                      <table role="presentation" width="100%" class="kpi-table" style="border-collapse:separate;border-spacing:12px 12px;table-layout:fixed;">
                        <tr>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Total Time</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${prettyTotal}</div>
                          </td>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Total Tasks</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${totalTasks}</div>
                          </td>
                        </tr>
                        <tr>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Active Days</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${activeDays}</div>
                          </td>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Avg Tasks/Day</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${avgTasksPerDayRounded}</div>
                          </td>
                        </tr>
                        <tr>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Avg Time/Day</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${prettyAvgDay}</div>
                          </td>
                          <td class="kpi-cell" style="padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0E1119;color:#9ca3af;text-align:center;">
                            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Avg Time/Task</div>
                            <div style="font-size:22px;font-weight:800;color:#FFAA00;margin-top:4px;">${prettyAvgTask}</div>
                          </td>
                        </tr>
                      </table>
                      ${tasksSectionsHtml}
                      <div class="cta-gap" style="text-align:center;margin:20px 0;">
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
                  <a href="https://superfocus.work/?modal=preferences" target="_blank" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
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
      // Compute local week start (Monday 00:00 in user's timezone) for dedupe/logging
      let weekStartLocal: Date | null = null;
      try {
        const rows = await prisma.$queryRaw<Array<{ week_start_local: Date }>>`
          SELECT date_trunc('week', (now() AT TIME ZONE ${user.timezone}))::date AS week_start_local
        `;
        weekStartLocal = rows?.[0]?.week_start_local ?? null;
      } catch {}

      // Skip if already sent this local week
      if (weekStartLocal) {
        try {
          const exists = await prisma.$queryRaw<Array<{ x: number }>>`
            SELECT 1 as x FROM "email_send_log" 
            WHERE user_id = ${user.id} 
              AND type = 'weekly_analytics' 
              AND week_start_date = ${weekStartLocal}
            LIMIT 1
          `;
          if (exists && exists.length > 0) {
            results.push({ userId: user.id, email: user.email, sent: false, error: 'already_sent_this_week' });
            continue;
          }
        } catch {}
      }

      // Send via Resend API (rate-limited with retry)
      try {
        if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
        const attempt = await sendWithRetry({ from: FROM_ADDRESS, to: [user.email], subject: "Focus Report: Last 7 Days", html });
        if (!attempt.ok) {
          let friendly = "Failed to send email";
          const apiMsg = attempt.apiMsg;
          if (attempt.status === 401 || attempt.status === 403) friendly = "Invalid or unauthorized RESEND_API_KEY";
          if (attempt.status === 422 && typeof apiMsg === 'string' && apiMsg.toLowerCase().includes('from')) friendly = "Invalid 'from' address. Use a verified domain or onboarding@resend.dev";
          results.push({ userId: user.id, email: user.email, sent: false, error: friendly });
          try {
            if (weekStartLocal) {
              await prisma.$executeRaw`
                INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status, error)
                VALUES (gen_random_uuid(), ${user.id}, 'weekly_analytics', ${weekStartLocal}, now(), 'error', ${String(apiMsg || friendly)})
                ON CONFLICT DO NOTHING
              `;
            }
          } catch {}
        } else {
          results.push({ userId: user.id, email: user.email, sent: true });
          try {
            if (weekStartLocal) {
              await prisma.$executeRaw`
                INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status)
                VALUES (gen_random_uuid(), ${user.id}, 'weekly_analytics', ${weekStartLocal}, now(), 'sent')
                ON CONFLICT DO NOTHING
              `;
            }
          } catch {}
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ userId: user.id, email: user.email, sent: false, error: message });
        try {
          if (weekStartLocal) {
            await prisma.$executeRaw`
              INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status, error)
              VALUES (gen_random_uuid(), ${user.id}, 'weekly_analytics', ${weekStartLocal}, now(), 'error', ${message})
              ON CONFLICT DO NOTHING
            `;
          }
        } catch {}
      }
    }

    const sentCount = results.filter(r => r.sent).length;
    return NextResponse.json({ success: sentCount > 0, sentCount, total: results.length, results });
  } catch (error) {
    console.error("[weekly-analytics email]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
