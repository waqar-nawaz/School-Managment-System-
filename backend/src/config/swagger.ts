import env from "./index";

const resourceNames = [
  "users", "roles", "permissions", "branches", "academic-years", "terms",
  "classes", "sections", "subjects", "enrolments", "students", "admissions",
  "parents", "teachers", "staff", "attendance", "exams", "exam-schedules",
  "exam-results", "report-cards", "assignments", "submissions", "gradebook",
  "grade-scales", "timetable", "periods", "fee-types", "invoices", "payments",
  "receipts", "refunds", "expenses", "payroll", "leaves", "books", "book-copies",
  "book-issues", "book-fines", "routes", "vehicles", "route-stops",
  "driver-assignments", "student-transport", "hostels", "rooms", "beds",
  "hostel-allocations", "events", "notices", "announcements", "messages",
  "notifications", "syllabus", "lesson-plans", "certificates", "health-records",
  "discipline-records", "complaints", "inventory", "assets", "audit-logs",
  "settings", "media", "visitor-logs",
];

function buildPaths(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const name of resourceNames) {
    paths[`/api/${name}`] = {
      get: {
        security: [{ bearerAuth: [] }],
        tags: [name],
        summary: `List ${name}`,
        parameters: [
          { in: "query", name: "page", schema: { type: "integer" } },
          { in: "query", name: "limit", schema: { type: "integer" } },
          { in: "query", name: "q", schema: { type: "string" }, description: "Search" },
          { in: "query", name: "sort", schema: { type: "string" }, description: "e.g. -createdAt" },
          { in: "query", name: "filter[field]", schema: { type: "string" }, description: "Exact field filter" },
        ],
        responses: { "200": { description: "Paginated list" } },
      },
      post: {
        security: [{ bearerAuth: [] }],
        tags: [name],
        summary: `Create ${name}`,
        requestBody: { content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
        responses: { "201": { description: "Created" } },
      },
    };
    paths[`/api/${name}/{id}`] = {
      get: {
        security: [{ bearerAuth: [] }],
        tags: [name],
        summary: `Get ${name} by id`,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
      put: {
        security: [{ bearerAuth: [] }],
        tags: [name],
        summary: `Replace ${name}`,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        security: [{ bearerAuth: [] }],
        tags: [name],
        summary: `Delete ${name}`,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Deleted" } },
      },
    };
  }
  return paths;
}

export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "School Management System API",
    version: "1.0.0",
    description: "Enterprise REST API for the School Management System",
  },
  servers: [{ url: `http://localhost:${env.port}/api` }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  paths: buildPaths(),
};