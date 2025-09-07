Update Streaks Lambda (AWS)

Overview
- Runs every 60 seconds via EventBridge to recompute current and longest streak for all users.
- Connects directly to Postgres using `pg` and `DATABASE_URL`.
- Uses an advisory lock to avoid overlapping runs.

Deploy (quick, via Console)
1) Create Lambda (Node.js 20.x)
   - Function name: `update-streaks`
   - Runtime: Node.js 20.x
   - Architecture: x86_64 (or arm64 if preferred)
   - Timeout: 120 seconds
   - Memory: 256–512 MB
   - VPC: select the VPC/subnets/security group that can reach your RDS Postgres

2) Build artifact locally
   ```bash
   cd aws/lambda/update-streaks
   pnpm install --prod   # or npm ci --omit=dev
   zip -r update-streaks.zip .
   ```

3) Upload code
   - In Lambda → Code → Upload from → .zip file → choose `update-streaks.zip`
   - Handler: `index.handler`

4) Env vars
   - `DATABASE_URL` = `postgres://user:pass@host:5432/db`
   - Optional: `PGSSL_DISABLE_VERIFY=true` to disable TLS cert verification if needed

5) Permissions
   - Execution role needs basic Lambda execution + VPC access if configured (AWS managed policies: `AWSLambdaBasicExecutionRole`, `AWSLambdaVPCAccessExecutionRole`).

6) Schedule
   - EventBridge → Rules → Create rule
   - Name: `update-streaks-every-minute`
   - Schedule pattern: `rate(1 minute)`
   - Target: Lambda function `update-streaks`
   - Enable the rule

Notes
- Ensure RDS networking allows connections from the Lambda’s subnets/security group.
- For production, prefer TLS with proper CA bundle. The opt-out flag is for quick validation only.
- To avoid double work, the function:
  - Locks with `pg_try_advisory_lock(123456789)`
  - Enforces `longest_streak >= streak`

