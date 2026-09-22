# Architecture

Enterprise-grade School Management System.

## Tech Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Frontend   | Angular 17 (standalone components, SCSS)      |
| Backend    | Node.js + Express (TypeScript, clean architecture) |
| Database   | MySQL 8 (Sequelize ORM)                       |
| Cache      | Redis (optional: rate-limit store, sessions)  |
| Runtime    | Node 20 (Alpine) via Docker                   |
| Reverse proxy | Nginx (frontend container also proxies `/api` to backend) |

## High Level Diagram

```
Browser
   │  HTTPS
   ▼
Nginx (frontend container, serves static Angular build)
   │  /api/*  →  proxied
   ▼
Express API (backend container, port 3000)
   │
   ├── Sequelize ORM ────► MySQL 8 (mysql container)
   └── Redis (redis container)
```

## Monorepo Layout

```
school-management-system/
├── backend/                            # Node.js + Express + TS API
│   └── src/
│       ├── config/                     # env, db, logger
│       ├── database/                   # sequelize + seeders
│       ├── models/                     # one file per DB table
│       ├── modules/                    # one folder per feature
│       │   ├── auth/                   # (route/controller/service/validation)
│       │   ├── students/
│       │   └── ...
│       ├── middlewares/                # jwt, rbac, error, validate, upload
│       ├── services/                   # email, sms, notification, audit
│       ├── utils/                      # ApiError, crudFactory, ...
│       ├── routes/                     # aggregates all module routes
│       └── jobs/                       # scheduled tasks (node-cron)
├── frontend/                           # Angular 17 SPA
│   └── src/app/
│       ├── core/                       # guards, interceptors, services, models
│       ├── shared/                     # reusable components/pipes/directives
│       ├── layouts/                    # auth + admin shell layouts
│       └── features/                   # lazy-loaded feature modules
├── database/
│   └── init/                           # SQL run on first MySQL boot
└── docs/                               # this documentation
```

## Backend Layering & Data Flow

```
Route (HTTP) ──► Validation ──► Middleware (auth/RBAC) ──► Controller
    ──► Service (business rules) ──► Model / Repository ──► MySQL
    ──► ApiResponse / ApiError (single response envelope)
```

Every module follows the same contract:

- `*.routes.ts` – mounts controller handlers, wires validation + guards
- `*.controller.ts` – thin request/response layer (uses `asyncHandler`)
- `*.service.ts` – business logic only
- The generic `crudFactory.ts` generates standard list/create/get/update/delete
  handlers so feature modules stay DRY yet individually extensible.

## Response Envelope

All API responses are uniform:

```json
{ "success": true, "message": "...", "data": { ... }, "meta": { "page": 1, "limit": 10, "total": 42 } }
```

Errors:

```json
{ "success": false, "message": "...", "errors": [ ... ] }
```

## Authentication & Authorization

- JWT access token (short lived) + refresh token (rotated, stored hashed).
- RBAC roles: `super_admin`, `admin`, `principal`, `teacher`, `parent`,
  `student`, `accountant`, `librarian`, `transport_manager`, `hostel_warden`,
  `receptionist`.
- Permission-check middleware guards each route; permissions map per role
  (see `constants/permissions.ts`).

## Modules (Features)

1. Authentication & user sessions
2. User & role/permission management
3. Dashboard analytics
4. Students (admission, enrolment, transfer, guardians)
5. Admissions (enquiries/applications pipeline)
6. Parents / guardians
7. Teachers
8. Staff (non-teaching)
9. Classes & sections
10. Subjects
11. Academic years & terms
12. Enrolments
13. Attendance (daily, by class)
14. Exams (schedules, halls)
15. Exam results / report cards
16. Homework / assignments & submissions
17. Gradebook & grade scales
18. Timetable (periods)
19. Fee management (fee types, invoice, payments, receipts, refunds)
20. Expenses & budgets
21. Payroll (salary sheets, payslips)
22. Leave management
23. Library (books, issues, returns, fines)
24. Transport (routes, stops, vehicles, driver assignment)
25. Hostel (hostels, rooms, beds, allocations)
26. Events & calendar
27. Notices & announcements
28. Messages (in-school communication)
29. Notifications (global/user, email/SMS hooks)
30. Syllabus & curriculum
31. Lesson plans
32. Certificates (TC, character, bonafide)
33. Health records
34. Discipline / behaviour incidents
35. Complaints / grievances
36. Inventory & assets
37. Audit logs
38. Reports (aggregated analytics)
39. Media / documents
40. Branches / campuses
41. School settings (localization, academic setup)