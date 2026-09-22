import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const dbDialect = (process.env.DB_DIALECT || "postgres") as "postgres" | "mysql";

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),

  db: {
    dialect: dbDialect,
    // Render/Heroku-style single connection string wins when present.
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
    // Fall back to Railway's managed DB plugin variables.
    host: process.env.DB_HOST || process.env.PGHOST || process.env.MYSQLHOST || "localhost",
    port: parseInt(
      process.env.DB_PORT ||
        process.env.PGPORT ||
        process.env.MYSQLPORT ||
        (dbDialect === "postgres" ? "5432" : "3306"),
      10
    ),
    name: process.env.DB_NAME || process.env.PGDATABASE || process.env.MYSQLDATABASE || "school_db",
    user: process.env.DB_USER || process.env.PGUSER || process.env.MYSQLUSER || (dbDialect === "postgres" ? "postgres" : "school_user"),
    pass: process.env.DB_PASS || process.env.PGPASSWORD || process.env.MYSQLPASSWORD || (dbDialect === "postgres" ? "postgres" : "school_pass"),
    ssl: process.env.DB_SSL === "true",
  },

  jwt: {
    secret: process.env.JWT_SECRET || "dev-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
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