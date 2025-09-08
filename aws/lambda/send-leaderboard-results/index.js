"use strict";

const { Pool } = require("pg");

function formatDuration(seconds) {
  const s = Number(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

exports.handler = async () => {
  const dbUrl = process.env.DATABASE_URL;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_ADDRESS = process.env.RESEND_FROM_LEADERBOARD || process.env.RESEND_FROM || "Superfocus <leaderboard@superfocus.work>";
  // Quote icon rendered as a stylized glyph to avoid remote images in email clients

  if (!dbUrl) {
    console.error("[send-leaderboard-results] Missing env DATABASE_URL");
    return { ok: false, error: "Missing DATABASE_URL" };
  }
  if (!RESEND_API_KEY) {
    console.error("[send-leaderboard-results] Missing env RESEND_API_KEY");
    return { ok: false, error: "Missing RESEND_API_KEY" };
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.PGSSL_DISABLE_VERIFY === "true" ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });

  const client = await pool.connect();
  const results = [];
  let selectedQuote = null;
  const RATE_LIMIT_PER_SEC = Number(process.env.RATE_LIMIT_PER_SEC || '3');
  const SEND_DELAY_MS = Math.max(0, Math.floor(1000 / Math.max(1, RATE_LIMIT_PER_SEC)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RETRY_MAX = Number(process.env.RETRY_MAX || '3');
  const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || '1000');
  const JITTER_MS = Number(process.env.RETRY_JITTER_MS || '250');

  try {
    const ordinal = (n) => {
      const v = n % 100;
      if (v >= 11 && v <= 13) return `${n}th`;
      switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
      }
    };

    // Compute current week start (Sunday 00:00 UTC) and previous week window
    const weekStart = new Date();
    const nowUTC = new Date(Date.UTC(
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth(),
      weekStart.getUTCDate(),
      weekStart.getUTCHours(),
      weekStart.getUTCMinutes(),
      weekStart.getUTCSeconds()
    ));
    const dayOfWeek = nowUTC.getUTCDay(); // 0..6 (Sun..Sat)
    const daysSinceSunday = dayOfWeek; // 0 if Sunday
    weekStart.setUTCDate(nowUTC.getUTCDate() - daysSinceSunday);
    weekStart.setUTCHours(0, 0, 0, 0);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

    // Build leaderboard for previous week
    const leaderboardRes = await client.query(`
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
          AND t.completed_at >= $1
          AND t.completed_at < $2
      GROUP BY 
        u.id, u.first_name, u.last_name
      HAVING 
        COUNT(DISTINCT t.id) > 0 OR SUM(t.duration) > 0
      ORDER BY 
        COALESCE(SUM(t.duration), 0) DESC
    `, [prevWeekStart, weekStart]);

    const weeklyLeaderboard = leaderboardRes.rows;

    // Select a quote to use for all recipients in this run
    try {
      const q = await client.query(
        'SELECT "id", "quote", "author" FROM "quote" WHERE "active" = true ORDER BY "lastUsedAt" NULLS FIRST, random() LIMIT 1'
      );
      if (q.rows && q.rows.length > 0) {
        selectedQuote = q.rows[0];
        await client.query(
          'UPDATE "quote" SET "lastUsedAt" = now(), "timesUsed" = "timesUsed" + 1 WHERE "id" = $1',
          [selectedQuote.id]
        );
      }
    } catch (e) {
      console.error('[send-leaderboard-results] Quote selection failed:', e);
    }

    // Fetch all users with a valid email who are opted-in for weekly leaderboard emails
    const usersRes = await client.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.streak
      FROM "user" u
      LEFT JOIN "preference" p ON p.user_id = u.id
      WHERE u.email IS NOT NULL AND u.email <> ''
        AND COALESCE(p.weekly_leaderboard_email, true) = true
    `);
    const allUsers = usersRes.rows;

    // Helper to send with retry on 429/5xx
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

    for (const user of allUsers) {
      if (!user || !user.email) {
        results.push({ userId: user?.id || 'unknown', sent: false, error: "User or email not found" });
        continue;
      }

      // Rank and 7-row window around user (2 above, user, up to 4 below; clamp edges)
      const rankIndex = weeklyLeaderboard.findIndex((e) => e.user_id === user.id);
      const weeklyRank = rankIndex >= 0 ? rankIndex + 1 : null;
      const n = weeklyLeaderboard.length;
      const windowSize = Math.min(7, n);
      let visualStart = 0;
      let visualEnd = windowSize - 1;
      if (rankIndex >= 0) {
        visualStart = Math.max(0, rankIndex - 2);
        visualEnd = visualStart + windowSize - 1;
        if (visualEnd >= n) {
          visualEnd = n - 1;
          visualStart = Math.max(0, visualEnd - windowSize + 1);
        }
        if (rankIndex < visualStart) {
          visualStart = Math.max(0, rankIndex - 2);
          visualEnd = Math.min(n - 1, visualStart + windowSize - 1);
        } else if (rankIndex > visualEnd) {
          visualEnd = Math.min(n - 1, rankIndex + 4);
          visualStart = Math.max(0, visualEnd - windowSize + 1);
        }
      }
      const visualGroup = weeklyLeaderboard
        .slice(visualStart, visualEnd + 1)
        .map((e, i) => ({
          ...e,
          rank: visualStart + i + 1,
          isUser: e.user_id === user.id,
        }));

      const streak = Number(user.streak || 0);
      const headerSubtitle = weeklyRank == null
        ? `We missed you! Let’s get you back on 🔥`
        : `Leaderboard Rank: <span style="color:#FFAA00;font-weight:700">#${weeklyRank}</span>` +
          (streak >= 1
            ? ` <span style=\"color:#374151\">|</span> <span style=\"color:#e5e7eb;font-weight:700\">${streak}</span> <span style=\"color:#9ca3af\">Day Streak</span> 🔥`
            : ``);

      const leaderboardVisualHtml = visualGroup.length > 0 ? `
      <table role="presentation" width="100%" style="margin-top:12px;border-collapse:separate;border-spacing:0 8px;">
        ${visualGroup.map(v => `
          <tr>
            <td style="padding:0;border:${v.isUser ? '1px solid #FFAA00' : '1px solid #1f2937'};border-radius:12px;background:#0E1119;">
              <div style="border:1px solid ${v.isUser ? '#FFAA00' : '#1f2937'};background:#0E1119;border-radius:12px;padding:12px;box-shadow:${v.isUser ? '0 0 0 2px rgba(255,170,0,0.35)' : 'none'};">
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

      const subject = weeklyRank == null ? "Leaderboard Results!" : `You Ranked ${ordinal(weeklyRank)}!`;

      const html = `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <title>Leaderboard Results!</title>
          <style>
            @media only screen and (max-width: 480px) {
              .wrapper-pad { padding: 0 !important; }
              .container-pad { padding: 0 !important; max-width: 100% !important; }
              .card-edge { border-radius: 16px !important; border: 0 !important; }
              .side-gap { display: none !important; width: 0 !important; }
            }
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
                      <div style="font-size:22px;font-weight:800;background:linear-gradient(90deg,#FFAA00,#ffb833);-webkit-background-clip:text;background-clip:text;color:transparent;">Leaderboard Results</div>
                      <div style="margin-top:6px;color:#9ca3af;font-size:13px;text-align:center;">${headerSubtitle}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 28px;">
                      ${selectedQuote ? `
                        <div style=\"border:1px solid #1f2937;background:linear-gradient(180deg,#0E1119 0%,#0B0E16 100%);border-radius:12px;padding:16px 18px;text-align:center;margin-bottom:14px;\">
                          <div style=\"font-size:24px;line-height:1;color:#ffffff;margin-bottom:8px;\">❝</div>
                          <div style=\"font-size:16px;color:#e5e7eb;\">${String(selectedQuote.quote || '')}</div>
                          <div style=\"margin-top:8px;color:#9ca3af;font-size:14px;\">${String(selectedQuote.author || '')}</div>
                        </div>
                      ` : `
                        <div style=\"border:1px solid #1f2937;background:linear-gradient(180deg,#0E1119 0%,#0B0E16 100%);border-radius:12px;padding:16px 18px;text-align:center;margin-bottom:14px;\">
                          <div style=\"font-size:24px;line-height:1;color:#ffffff;margin-bottom:8px;\">❝</div>
                          <div style=\"font-size:16px;color:#e5e7eb;\">Small deeds done are better than great deeds planned.</div>
                          <div style=\"margin-top:8px;color:#9ca3af;font-size:14px;\">Peter Marshall</div>
                        </div>
                      `}
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

      // Send via Resend API (Node 20 global fetch)
      // Throttle: ~3 sends/second (configurable via RATE_LIMIT_PER_SEC)
      if (SEND_DELAY_MS > 0) {
        await sleep(SEND_DELAY_MS);
      }
      const attemptRes = await sendWithRetry({
        from: FROM_ADDRESS,
        to: [user.email],
        subject,
        html,
      });
      if (attemptRes.ok) {
        const messageId = attemptRes.json?.id || attemptRes.json?.data?.id || undefined;
        results.push({ userId: user.id, email: user.email, sent: true, messageId });
      } else {
        let friendly = "Failed to send email";
        if (attemptRes.status === 401 || attemptRes.status === 403) friendly = "Invalid or unauthorized RESEND_API_KEY";
        if (attemptRes.status === 422 && typeof attemptRes.apiMsg === 'string' && attemptRes.apiMsg.toLowerCase().includes('from')) friendly = "Invalid 'from' address. Use a verified domain or onboarding@resend.dev";
        const detail = `${friendly} (status ${attemptRes.status})${attemptRes.apiMsg ? `: ${String(attemptRes.apiMsg)}` : ''}`;
        console.error('[send-leaderboard-results] Resend failure', { email: user.email, status: attemptRes.status, apiMsg: attemptRes.apiMsg });
        results.push({ userId: user.id, email: user.email, sent: false, error: detail });
      }
    }

    const sentCount = results.filter((r) => r.sent).length;
    return { ok: sentCount > 0, sentCount, total: results.length, results };
  } catch (e) {
    console.error("[send-leaderboard-results] Error:", e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    client.release();
    await pool.end();
  }
};
