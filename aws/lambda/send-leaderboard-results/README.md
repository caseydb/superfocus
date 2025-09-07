Send Leaderboard Results Lambda (AWS)

Overview
- Sends the PREVIOUS week's leaderboard results (Sunday 00:00 UTC → next Sunday 00:00 UTC) to two hardcoded user IDs (for testing).
- Connects directly to Postgres using `pg` and `DATABASE_URL`.
- Uses Resend API to send the email.

Deploy (quick, via Console)
1) Create Lambda (Node.js 20.x)
   - Function name: `send-leaderboard-results`
   - Runtime: Node.js 20.x
   - Architecture: x86_64 (or arm64)
   - Timeout: 60–120 seconds
   - Memory: 256–512 MB
   - VPC: select subnets/SG that can reach your RDS Postgres

2) Upload artifact
   - Use the provided ZIP: `send-leaderboard-results.zip`
   - Handler: `index.handler`

3) Env vars (Configuration → Environment variables)
   - `DATABASE_URL` = `postgres://user:pass@host:5432/db`
   - `RESEND_API_KEY` = `re_...`
   - Optional: `RESEND_FROM_LEADERBOARD` = `Superfocus <leaderboard@superfocus.work>` (overrides `RESEND_FROM`)
   - Optional: `PGSSL_DISABLE_VERIFY=true` to skip TLS cert validation (for quick testing only)

4) Permissions
   - Execution role: `AWSLambdaBasicExecutionRole` (logs) and `AWSLambdaVPCAccessExecutionRole` if in VPC.

5) Schedule (EventBridge)
   - Create a rule: e.g., `send-leaderboard-results-weekly`
   - Cron suggestion (every Monday at 00:05 UTC for the previous week): `cron(5 0 ? * MON *)`
   - Target: Lambda function `send-leaderboard-results`

Notes
- Email template matches the in-app "Leaderboard Results" email.
- Highlights the current user row with a gold border (mobile-safe).
- Shows up to 7 rows around the user (2 above, user, up to 4 below) with edge clamping.
- Footer preference link points to `https://superfocus.work/?modal=preferences`.
