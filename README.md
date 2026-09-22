# School Management System (EduSuite)

A full-stack, containerized enterprise school management system.

- **Frontend:** Angular 17 (standalone components, SCSS, config-driven UI)
- **Backend:** Node.js 20 + Express + TypeScript + Sequelize (`sequelize-typescript`) + Zod
- **Database:** MySQL 8 · **Cache/Queue:** Redis 7 (optional)
- **Infra:** Docker Compose (mysql, redis, backend, frontend/nginx)

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
- Health: `GET /api/health`; docs: `GET /api/docs` (Swagger UI)

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build    # starts MySQL, Redis, backend, frontend
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
make backup  # mysqldump into database/backups/
```

## Roles & permissions

`backend/src/config/permissions.ts` defines the role → permission matrix; the frontend mirrors it in `src/app/config/frontend-permissions.ts`. Menu items in `src/app/config/menu.ts` are permission-gated and drive the sidebar. Each role – super_admin, admin, principal, teacher, parent, student, accountant, librarian, transport_manager, hostel_warden, receptionist – has granular `resource:action` access.