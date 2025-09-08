Weekly Analytics Email Lambda
================================

Sends the weekly analytics email (“Focus Report: Last 7 Days”) to users at Monday 07:00 in their local timezone. Runs every 5 minutes via EventBridge and selects only users whose local time is within 07:00–07:10 and who have not been sent for the current week.

Prereqs
- DATABASE_URL (Postgres)
- RESEND_API_KEY
- RESEND_FROM_ANALYTICS (optional) or RESEND_FROM (fallback) — e.g. "Superfocus Analytics <analytics@superfocus.work>"

DB Idempotency
- Uses table `email_send_log` (unique key (user_id, type, week_start_date)) to prevent duplicate weekly sends.

Scheduling
- Create an EventBridge rule: every 5 minutes (cron: `cron(*/5 * * * ? *)`).
- Target this Lambda.

Deploy
- Build zip: from this folder run: `zip -r -q send-weekly-analytics.zip index.js node_modules package.json package-lock.json`
- Upload the zip to the Lambda function.

Throttling (Strongly Recommended)
- Rate cap in code: The function spaces sends using `RATE_LIMIT_PER_SEC` (default 3). Set `RATE_LIMIT_PER_SEC=3` explicitly in the Lambda environment.
- Reserved concurrency: Set the Lambda's reserved concurrency to 1 to prevent parallel invocations exceeding the per‑second cap.

AWS CLI examples
- Set reserved concurrency to 1:
  aws lambda put-function-concurrency \
    --function-name send-weekly-analytics \
    --reserved-concurrent-executions 1

- Set env var (merges with existing if using Console is easier):
  aws lambda update-function-configuration \
    --function-name send-weekly-analytics \
    --environment "Variables={RATE_LIMIT_PER_SEC=3}"

