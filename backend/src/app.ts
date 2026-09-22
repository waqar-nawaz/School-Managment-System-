import express, { Application } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import path from "path";
import fs from "fs";

import env from "./config";
import { logger } from "./config/logger";
import { swaggerSpec } from "./config/swagger";
import { apiLimiter } from "./middlewares/rateLimiter";
import { notFoundHandler, errorHandler } from "./middlewares/error";
import routes from "./routes";

const app: Application = express();

// Behind a proxy (Render/Heroku) so req.protocol reflects X-Forwarded-Proto.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin.split(",").map((s) => s.trim()), credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined", { stream: { write: (m) => logger.info(m.trim()) } }));

app.use(express.static(path.join(process.cwd(), "uploads"), { maxAge: "1d" }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/health", (_req, res) =>
  res.json({
    success: true,
    message: "School Management API is healthy",
    database: app.locals.dbReady === true ? "connected" : "unavailable",
    ...(app.locals.dbReady === true ? {} : { databaseError: app.locals.dbError || "unknown" }),
    uptime: process.uptime(),
  })
);

if (env.nodeEnv !== "production") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use("/api", (req, res, next) => {
  if (app.locals.dbReady !== true) {
    res.status(503).json({
      success: false,
      message: "Database is not available. Set DB_* environment variables in the service and redeploy.",
    });
    return;
  }
  next();
});
app.use("/api", apiLimiter);
app.use("/api", routes);

// Serve the built Angular SPA (same origin -> /api calls work without CORS).
// Angular/CLI versions can place the browser build either directly under
// dist/sms-frontend or under dist/sms-frontend/browser, so detect both.
// This also keeps asset requests (CSS/JS) on the real static directory
// instead of accidentally falling through to index.html.
const frontendCandidates = [
  path.resolve(__dirname, "..", "..", "frontend", "dist", "sms-frontend"),
  path.resolve(__dirname, "..", "..", "frontend", "dist", "sms-frontend", "browser"),
];
const frontendDist = frontendCandidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));

if (frontendDist) {
  logger.info(`Serving Angular frontend from ${frontendDist}`);
  app.use(express.static(frontendDist, { maxAge: "1h", index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/health") || req.path.startsWith("/uploads")) {
      return next();
    }
    return res.sendFile(path.join(frontendDist, "index.html"), {
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    });
  });
} else {
  logger.error(`Angular frontend build not found. Checked: ${frontendCandidates.join(", ")}`);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;