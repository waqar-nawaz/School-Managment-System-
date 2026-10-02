import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const nodeEnv = process.env.NODE_ENV || "development";

// Fail fast in production if JWT secrets are missing or still the dev defaults.
const DEV_DEFAULTS = new Set(["dev-secret", "dev-refresh-secret", ""]);
const jwtSecret = process.env.JWT_SECRET || "";
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";
if (nodeEnv === "production") {
  if (DEV_DEFAULTS.has(jwtSecret) || jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be set to a strong value (>=16 chars) in production.");
  }
  if (DEV_DEFAULTS.has(jwtRefreshSecret) || jwtRefreshSecret.length < 16) {
    throw new Error("JWT_REFRESH_SECRET must be set to a strong value (>=16 chars) in production.");
  }
}

const env = {
  nodeEnv,
  port: parseInt(process.env.PORT || "3000", 10),

  db: {
    // PostgreSQL is the only supported database.
    dialect: "postgres" as const,
    // Render/Heroku/Railway-style single connection string wins when present.
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
    host: process.env.DB_HOST || process.env.PGHOST || "localhost",
    port: parseInt(process.env.DB_PORT || process.env.PGPORT || "5432", 10),
    name: process.env.DB_NAME || process.env.PGDATABASE || "school_db",
    user: process.env.DB_USER || process.env.PGUSER || "postgres",
    pass: process.env.DB_PASS || process.env.PGPASSWORD || "postgres",
    ssl: process.env.DB_SSL === "true",
  },

  jwt: {
    secret: jwtSecret || "dev-secret",
    refreshSecret: jwtRefreshSecret || "dev-refresh-secret",
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:4200",

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || "120", 10),
  },

  mail: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "no-reply@school.local",
  },

  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || "",
  },

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4200",
  runSeeders: process.env.RUN_SEEDERS === "true",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
} as const;

export default env;