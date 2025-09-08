"use strict";

import { Pool } from "pg";

function formatDuration(seconds) {
  const s = Number(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const handler = async () => {
  const dbUrl = process.env.DATABASE_URL;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_ADDRESS = process.env.RESEND_FROM_ANALYTICS || process.env.RESEND_FROM || "Superfocus Analytics <analytics@superfocus.work>";
  // Sends to all eligible users in the local-time window

  if (!dbUrl) {
    console.error("[send-weekly-analytics] Missing env DATABASE_URL");
    return { ok: false, error: "Missing DATABASE_URL" };
  }
  if (!RESEND_API_KEY) {
    console.error("[send-weekly-analytics] Missing env RESEND_API_KEY");
    return { ok: false, error: "Missing RESEND_API_KEY" };
  }

  const RATE_LIMIT_PER_SEC = Number(process.env.RATE_LIMIT_PER_SEC || '3');
  const SEND_DELAY_MS = Math.max(0, Math.floor(1000 / Math.max(1, RATE_LIMIT_PER_SEC)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RETRY_MAX = Number(process.env.RETRY_MAX || '3');
  const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || '1000');
  const JITTER_MS = Number(process.env.RETRY_JITTER_MS || '250');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.PGSSL_DISABLE_VERIFY === "true" ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });
  const client = await pool.connect();

  const sendWithRetry = async (payload) => {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const rawText = await res.text();
        let json = {}; try { json = rawText ? JSON.parse(rawText) : {}; } catch {}
        if (res.ok) return { ok: true, json };
        const status = res.status;
        const apiMsg = json?.message || json?.error?.message || json?.error || rawText;
        const isRetryable = status === 429 || (status >= 500 && status < 600);
        if (attempt < RETRY_MAX && isRetryable) {
          const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * JITTER_MS);
          await sleep(backoff + jitter);
          continue;
        }
        return { ok: false, status, apiMsg };
      } catch (err) {
        if (attempt < RETRY_MAX) {
          const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * JITTER_MS);
          await sleep(backoff + jitter);
          continue;
        }
        return { ok: false, status: 0, apiMsg: String(err && err.message ? err.message : err) };
      }
    }
  };

  try {
    // Select one quote for this run (optional, used by all recipients this invocation)
    let selectedQuote = null;
    try {
      const q = await client.query('SELECT "id", "quote", "author" FROM "quote" WHERE "active" = true ORDER BY "lastUsedAt" NULLS FIRST, random() LIMIT 1');
      if (q.rows && q.rows.length > 0) {
        selectedQuote = q.rows[0];
        await client.query('UPDATE "quote" SET "lastUsedAt" = now(), "timesUsed" = "timesUsed" + 1 WHERE "id" = $1', [selectedQuote.id]);
      }
    } catch (e) {
      console.error('[send-weekly-analytics] Quote selection failed:', e);
    }

    // Select all users in local Monday 07:00–07:10 window. Dedupe per week via email_send_log.
    const eligible = await client.query(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.streak, u.timezone,
        date_trunc('week', (now() AT TIME ZONE u.timezone))::date AS week_start_local
      FROM "user" u
      LEFT JOIN "preference" p ON p.user_id = u.id
      LEFT JOIN "email_send_log" l 
        ON l.user_id = u.id 
        AND l.type = 'weekly_analytics'
        AND l.week_start_date = date_trunc('week', (now() AT TIME ZONE u.timezone))::date
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND COALESCE(p.weekly_analytics_email, true) = true
        AND EXTRACT(DOW FROM (now() AT TIME ZONE u.timezone)) = 1
        AND ( (now() AT TIME ZONE u.timezone)::time >= TIME '07:00' 
              AND (now() AT TIME ZONE u.timezone)::time < TIME '07:10' )
        AND l.id IS NULL
    `);

    const users = eligible.rows;
    console.log(`[send-weekly-analytics] Eligible users this run: ${users.length}`);

    for (const user of users) {
      try {
        // Compute 7-day window (server-local; matches app route logic)
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);

        // Fetch user's completed tasks in last 7 days
        const tasksRes = await client.query(
          `SELECT id, duration, completed_at, task_name
           FROM "task"
           WHERE user_id = $1 AND status = 'completed' AND completed_at >= $2
           ORDER BY completed_at DESC`,
          [user.id, start]
        );
        const tasks = tasksRes.rows || [];
        const totalTasks = tasks.length;
        const totalSeconds = tasks.reduce((sum, t) => sum + Number(t.duration || 0), 0);

        // Build day map for last 7 days
        const dayMap = new Map();
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${dd}`;
          dayMap.set(key, { tasks: 0, seconds: 0 });
        }
        for (const t of tasks) {
          const completedAt = t.completed_at ? new Date(t.completed_at) : new Date();
          const y = completedAt.getFullYear();
          const m = String(completedAt.getMonth() + 1).padStart(2, '0');
          const dd = String(completedAt.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${dd}`;
          const entry = dayMap.get(key);
          if (entry) { entry.tasks += 1; entry.seconds += Number(t.duration || 0); }
        }
        const activeDays = Array.from(dayMap.values()).filter(v => v.seconds > 0).length;
        const avgPerDaySeconds = activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0;

        // Header subtitle (no rank)
        const streak = Number(user.streak || 0);
        const headerSubtitle = totalTasks === 0
          ? `We missed you! Let’s get you back on 🔥`
          : `${streak >= 1 
                ? `<span style=\"color:#e5e7eb;font-weight:700\">${streak}</span> <span style=\"color:#9ca3af\">Day Streak</span> 🔥`
                : `You Worked <span style=\"color:#e5e7eb;font-weight:700\">${activeDays}</span> Days 🔥`}`;

        // KPIs
        const prettyTotal = formatDuration(totalSeconds);
        const prettyAvgDay = formatDuration(avgPerDaySeconds);
        const avgTasksPerDayRounded = Math.round(totalTasks / Math.max(1, activeDays));
        const avgTimePerTaskSeconds = Math.round(totalSeconds / Math.max(1, totalTasks));
        const prettyAvgTask = formatDuration(avgTimePerTaskSeconds);

        // Quote block using stylized glyph ❝
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

        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Your';
        const firstName = (user.first_name || fullName.split(' ')[0] || 'You').trim();

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
                .card-edge { border-radius: 16px !important; border: 0 !important; }
                .kpi-table tr { display: block !important; }
                .kpi-table { border-spacing: 0 12px !important; }
                .kpi-table .kpi-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; margin: 0 0 12px 0 !important; padding: 16px !important; }
                .side-gap { display: none !important; width: 0 !important; }
                .cta-gap { margin: 20px 0 !important; }
              }
              a[x-apple-data-detectors], .unstyle-auto-detected-links a, #sf-address a {
                color: inherit !important; text-decoration: none !important; pointer-events: none !important; cursor: default !important;
                font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
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

        if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS);
        const sendRes = await sendWithRetry({
          from: FROM_ADDRESS,
          to: [user.email],
          subject: "Focus Report: Last 7 Days",
          html,
        });

        if (!sendRes.ok) {
          console.error(`[send-weekly-analytics] Send failed for ${user.email}:`, sendRes.status, sendRes.apiMsg);
          await client.query(
            'INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status, error) VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, $5) ON CONFLICT DO NOTHING',
            [user.id, 'weekly_analytics', user.week_start_local, 'error', String(sendRes.apiMsg || '')]
          );
          continue;
        }

        await client.query(
          'INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status) VALUES (gen_random_uuid(), $1, $2, $3, now(), $4) ON CONFLICT DO NOTHING',
          [user.id, 'weekly_analytics', user.week_start_local, 'sent']
        );
      } catch (err) {
        console.error('[send-weekly-analytics] Error per-user:', err);
        try {
          await client.query(
            'INSERT INTO "email_send_log" (id, user_id, type, week_start_date, sent_at, status, error) VALUES (gen_random_uuid(), $1, $2, $3, now(), $4, $5) ON CONFLICT DO NOTHING',
            [user.id, 'weekly_analytics', user.week_start_local, 'error', String(err && err.message ? err.message : err)]
          );
        } catch {}
      }
    }

    return { ok: true, sent: users.length };
  } catch (e) {
    console.error('[send-weekly-analytics] Fatal:', e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    try { client.release(); } catch {}
    // Don't await pool.end() to avoid holding the event loop; let Lambda clean up the process
    try { pool.end(); } catch {}
  }
};
