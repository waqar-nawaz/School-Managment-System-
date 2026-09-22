# Deploy to Railway

Railway actually **does** provide managed MySQL (unlike Render), so this is the simplest
live deployment path. The API and the built Angular SPA ship in a single Docker image.

## What's already in the repo

- Root `Dockerfile` — builds the Angular app, builds the backend, runs one container that
  serves both `/api/*` and the SPA (same origin, no CORS/proxy config).
- `railway.json` — start command, health check at `/health`.
- `backend/src/config/index.ts` reads Railway's `MYSQLHOST / MYSQLPORT / MYSQLDATABASE /
  MYSQLUSER / MYSQLPASSWORD` variables automatically (no env setup needed).

## Steps

1. Sign up / login at https://railway.app -> **New Project** -> **Deploy from GitHub repo** ->
   select `School-Managment-System-`. (You may need to grant Railway access to that repo.)

2. With the service selected:
   - **Settings** tab -> verify the build uses the root `Dockerfile` (auto-detected).
   - In **Variables**, add `NODE_ENV=production`.

3. Add the database:
   - Click the project's `+` / **Plugin** -> **MySQL** -> **Add MySQL**.
   - Railway injects `MYSQLHOST/MYSQLPORT/MYSQLDATABASE/MYSQLUSER/MYSQLPASSWORD` into the
     service automatically. Nothing else to configure.

4. **Deploy**. First boot runs `sequelize.sync()` (creates ~70 tables) and seeds defaults.

> Quick alternative via CLI: install `@railway/cli`, `railway login`, `railway init`,
> then `railway up` from the repo root (uses the same Dockerfile).

## After deploy

- Service URL: `https://<project>.up.railway.app`
- Health: `<url>/health`
- Login: `superadmin` / `Admin@123`

## Notes

- Railway has **no free tier** (a trial credit is included; needs a card after).
- Uploaded files are stored on the container's ephemeral disk; to persist them, add a
  Railway Volume and set `UPLOAD_DIR` to its mount path.
- Scheduled jobs (cron) are off in production; set `RUN_JOBS=true` only for a single-instance
  service.