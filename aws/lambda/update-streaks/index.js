"use strict";

const { Pool } = require("pg");

function dayString(ts, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const map = parts.reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${map.year}-${map.month}-${map.day}`;
}

function computeLongestStreakFromDays(dayStrings) {
  if (!dayStrings || dayStrings.length === 0) return 0;
  const uniq = Array.from(new Set(dayStrings)).sort();
  const addOneDay = (ds) => {
    const [y, m, d] = ds.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  let longest = 1;
  let current = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === addOneDay(uniq[i - 1])) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}

exports.handler = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[update-streaks] Missing env DATABASE_URL");
    return { ok: false, error: "Missing DATABASE_URL" };
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.PGSSL_DISABLE_VERIFY === "true" ? { rejectUnauthorized: false } : undefined,
    max: 2,
  });

  const client = await pool.connect();
  const oneDay = 24 * 60 * 60 * 1000;
  let updated = 0;
  let scanned = 0;

  try {
    // Prevent overlapping runs
    const lockRes = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [123456789]);
    if (!lockRes.rows[0]?.locked) {
      console.log("[update-streaks] Another run is active; skipping");
      return { ok: true, skipped: true };
    }

    const usersRes = await client.query(
      'SELECT id, timezone, COALESCE(streak,0) AS streak, COALESCE(longest_streak,0) AS longest_streak FROM "user"'
    );
    const users = usersRes.rows;

    for (const u of users) {
      scanned++;
      const userId = u.id;
      const tz = u.timezone || "UTC";
      const curStreakDb = Number(u.streak || 0);
      const curLongestDb = Number(u.longest_streak || 0);

      const daysRes = await client.query(
        `SELECT DISTINCT to_char((completed_locally_at)::date, 'YYYY-MM-DD') AS day
         FROM "task"
         WHERE user_id = $1 AND status = 'completed' AND completed_locally_at IS NOT NULL`,
        [userId]
      );
      const dayStrings = daysRes.rows.map((r) => r.day);
      const daySet = new Set(dayStrings);

      // Current streak anchored to user's timezone
      const now = Date.now();
      const today = dayString(now, tz);
      const yesterday = dayString(now - oneDay, tz);
      let current = 0;
      let cursor = "";
      if (daySet.has(today)) cursor = today;
      else if (daySet.has(yesterday)) cursor = yesterday;
      while (cursor && daySet.has(cursor)) {
        current++;
        const stepTs = now - current * oneDay;
        cursor = dayString(stepTs, tz);
      }

      // Longest
      let longest = computeLongestStreakFromDays(dayStrings);
      if (current > longest) longest = current;

      if (current !== curStreakDb || longest !== curLongestDb) {
        await client.query('UPDATE "user" SET streak = $2, longest_streak = $3 WHERE id = $1', [
          userId,
          current,
          longest,
        ]);
        updated++;
      }
    }

    console.log(`[update-streaks] Scanned ${scanned}, updated ${updated}`);
    return { ok: true, scanned, updated };
  } catch (e) {
    console.error("[update-streaks] Error:", e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [123456789]);
    } catch {}
    client.release();
    await pool.end();
  }
};

