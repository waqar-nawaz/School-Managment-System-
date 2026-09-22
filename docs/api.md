# API Reference (summary)

Base URL: `http://localhost:3000/api` (inside docker: served on `<host>/api`)

## Authentication

| Method | Endpoint               | Description                    |
|--------|------------------------|--------------------------------|
| POST   | /auth/login            | Login, returns access + refresh |
| POST   | /auth/refresh          | Rotate refresh token           |
| POST   | /auth/logout           | Invalidate refresh token       |
| POST   | /auth/forgot-password  | Request reset link / OTP       |
| POST   | /auth/reset-password   | Reset password with token      |
| POST   | /auth/change-password  | Change password (authenticated)|
| POST   | /auth/verify-email     | Verify email with token        |
| GET    | /auth/me               | Current authenticated user     |

## Module conventions

Every resource module exposes a standard set, subject to RBAC:

| Method  | Endpoint             | Query params                                   |
|---------|----------------------|------------------------------------------------|
| GET     | /api/<resource>      | page, limit, q (search), sort, filter[...]     |
| GET     | /api/<resource>/:id  | –                                              |
| POST    | /api/<resource>      | JSON body                                      |
| PUT     | /api/<resource>/:id  | JSON body                                      |
| PATCH   | /api/<resource>/:id  | Partial JSON body                              |
| DELETE  | /api/<resource>/:id  | –                                              |

Standard paginated meta is returned in the `meta` key of the envelope.

## Export endpoints

Several modules provide `GET /api/<resource>/export?type=csv|xlsx` — file download
of the current filtered dataset.

## Full module list

`users`, `roles`, `permissions`, `branches`, `academic-years`, `terms`,
`classes`, `sections`, `subjects`, `enrolments`, `students`, `admissions`,
`parents`, `teachers`, `staff`, `attendance`, `exams`, `exam-schedules`,
`exam-results`, `report-cards`, `assignments`, `submissions`, `gradebook`,
`grade-scales`, `timetable`, `periods`, `fee-types`, `invoices`, `payments`,
`receipts`, `refunds`, `expenses`, `payroll`, `leaves`, `books`, `book-issues`,
`book-fines`, `routes`, `vehicles`, `route-stops`, `driver-assignments`,
`student-transport`, `hostels`, `rooms`, `beds`, `hostel-allocations`,
`events`, `notices`, `announcements`, `messages`, `notifications`, `syllabus`,
`lesson-plans`, `certificates`, `health-records`, `discipline-records`,
`complaints`, `inventory`, `audit-logs`, `settings`, `media`.

Interactive docs are available at `/api-docs` (Swagger UI) when `NODE_ENV != production`.