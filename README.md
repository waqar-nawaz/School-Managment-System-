# School Management System (EduSuite)

A full-stack, containerized enterprise school management system.

- **Frontend:** Angular 17 (standalone components, SCSS, config-driven UI)
- **Backend:** Node.js 20 + Express + TypeScript + Sequelize (`sequelize-typescript`) + Zod
- **Database:** PostgreSQL 16 · **Cache/Queue:** Redis 7 (optional)
- **Infra:** Docker Compose (postgres, redis, backend, frontend/nginx)

## Features

- **Academics** – students, teachers, staff, classes, sections, subjects, enrolments, attendance (register + bulk), exams, exam results, report cards, assignments/submissions, gradebook, timetable, periods, syllabus, lesson plans
- **Admissions** – full application pipeline (enquiry → … → enrolled → withdrawn), status transitions, pipeline stats
- **Finance** – fee types, invoice generation (from fee types / custom line items), payments → receipts, expenses, payroll, payslips, refunds
- **Library** – books, copies, issues/returns/overdue/lost, fines
- **Transport** – routes, route stops, vehicles, driver assignments, student transport allocations
- **Hostel** – hostels, rooms, beds, allocations
- **Communication** – events, notices, announcements, messages, notifications, complaints
- **Services** – certificates (issue + verification), health records, discipline, inventory, assets, media uploads, visitor logs
- **Administration** – users, roles, role–permission matrix, permissions, settings (key–value), audit logs, dashboard, reports (by class, attendance rate, fees, exam performance, snapshot), CSV export

## Tech stack details

- REST 1-NN envelope: `{ success, message, data, meta? } | { success, message, errors? }`
- JWT access tokens + hashed rotating refresh tokens; Redis-backed blacklist (optional)
- Role-based access control: middleware `authenticate` + `authorize('resource:action')`
- Audit logging on sensitive writes; scheduled jobs (overdue fees, overdue books, fee reminders, refresh-token purge)
- Health: `GET /health`; docs: `GET /api-docs` (Swagger UI)

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build    # starts PostgreSQL, Redis, backend, frontend
```

Then open <http://localhost>. The backend seeds defaults on first boot incl. a super admin:

| Field    | Value              |
| -------- | ------------------ |
| Username | `superadmin`       |
| Password | `Admin@123`        |

## Local development

Backend (port 3000):

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # ts-node watch
npm run typecheck
npm run build        # compile to dist/
```

Frontend (port 4200, proxies `/api` → localhost:3000):

```bash
cd frontend
npm install
ng serve
```

## Project layout

```
backend/
  src/
    config/      env, logger, permissions matrix, swagger
    database/    sequelize connection, seeders (roles, permissions, admin, classes…)
    models/      70+ Sequelize models + associations (index.ts)
    middlewares/ authenticate, authorize, validate (zod), upload, rate limiter, error
    modules/     auth, users, dashboard, reports, settings, roles, permissions,
                 students, admissions, attendance, invoices, payments, book-issues,
                 media, certificates, resources (config-driven CRUD ~50 endpoints)
    routes/      aggregate router
    services/    audit, cache (redis), notification, email (nodemailer), sms
    jobs/        cron jobs
    utils/       ApiError, ApiResponse, asyncHandler, crudFactory, pagination, tokens
frontend/
  src/app/
    config/      menu + role-permission map (mirrors backend)
    core/        guards, interceptors, services (api/auth/permission/toast/storage), models
    shared/      toast + confirm components
    layouts/     auth + admin (sidebar from config, permission-gated)
    features/    login/reset, dashboard, users, admissions, attendance, invoices,
                 reports, settings, profile + resources (generic CRUD for all modules)
    environments/ apiUrl = /api
database/
  init/          01_schema.sql (audit table + utf8mb4)
docs/            architecture.md, api.md
```

## Commands (Makefile)

```bash
make up      # docker compose up --build -d
make down    # stop and remove containers
make logs    # follow logs
make seed    # run backend seeders
make backup  # pg_dump into ./backups/ (gzip)
```

## Roles & permissions

`backend/src/config/permissions.ts` defines the role → permission matrix; the frontend mirrors it in `src/app/config/frontend-permissions.ts`. Menu items in `src/app/config/menu.ts` are permission-gated and drive the sidebar. Each role – super_admin, admin, principal, teacher, parent, student, accountant, librarian, transport_manager, hostel_warden, receptionist – has granular `resource:action` access.

## Notes from the full code review

- **Database:** PostgreSQL is the only supported database (MySQL support was removed). The schema is created automatically on first boot.
- **First login:** `superadmin` / the password from `SEED_ADMIN_PASSWORD` (dev default `Admin@123`). Change it immediately in production.
- **Roles & Permissions:** the screen under *Administration -> Roles* edits what each role may do. Changes apply immediately; custom roles are supported.
- **Resource definitions** (generic CRUD endpoints) now live in `backend/src/modules/resources/definitions/*.ts`, one file per domain.
- **Uploads** are served from `/uploads`; on hosts with ephemeral disks (e.g. Render free tier) files disappear on redeploy, so mount a persistent disk or move to object storage.
- **Hostel:** a bed is "occupied" only while a student has an *active* allocation, and "full" rooms are worked out from their beds - neither is edited by hand. Use *Hostel Allocations -> Allocate bed / Check out / Transfer*; transfers keep the old stay as history. Boys/girls hostels only accept matching students. Smoke test: `npm run smoke:hostel` (backend, on a fresh DB).
- **Hostel billing:** *Invoices -> Generate invoice* can add a resident's hostel fee, and *Invoices -> Bill hostel fees* creates one invoice per resident for a chosen month. A student is never billed twice for the same month, and a student who leaves school is checked out of the hostel automatically.
- **Students & admissions:** *Students -> Admit student* and *Admissions -> Register* use the same code path. Admission numbers look like `ADM-2026-0001`; roll numbers are assigned per section; a parent who already has a child here (same phone and name) is reused instead of duplicated. Logins created for the student and parents are shown **once** in a "Save these now" dialog (they can be re-issued from the student profile with *Reset family logins*). An application becomes "admitted" only through *Register*, never by hand. Smoke test: `npm run smoke:students`.
- **Employees & payroll:** *Employees -> Add employee* creates the login, the profile (`EMP-0001` numbering) and the salary in one step; login details are shown once. Name/phone/email stay identical on the login, Staff and Teacher records, and deactivating a login also removes the person from the staff list and future payroll. *Payroll* works month by month: **Prepare** (one draft per employee with a salary, never twice for the same person) -> **Approve** -> **Create payslips** -> **Mark paid**. Paid salaries are locked. On first start after upgrading, employees created before this change get a profile automatically (one time). Smoke test: `npm run smoke:staff`. Each smoke test expects a fresh database.
- **Users & logins:** usernames and emails are unique regardless of letter case (emails are stored lowercase; usernames are letters/numbers/dot/dash/underscore, no spaces) and login works with either, in any case. Student logins cannot be added from *Users* (they come from *Admit student*). Deleting a login deactivates the employee's profile and frees any hostel they ran; deactivating or re-typing a hostel warden does the same. Refresh tokens are unique per login (two sign-ins in the same second used to fail with "tokenHash must be unique"). Smoke test: `npm run smoke:users`.
