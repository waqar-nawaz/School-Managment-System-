import env from "./config";
import { logger } from "./config/logger";
import app from "./app";
import { connectDatabase } from "./database/sequelize";
import { defineAssociations } from "./models";
import { runSeeders } from "./database/seeders";
import { startJobs } from "./jobs";

async function bootstrap(): Promise<void> {
  defineAssociations();

  // The HTTP server must come up even if the database is temporarily
  // unreachable, otherwise Render's health check fails and the deploy is
  // marked as failed. Database-dependent routes will return errors until the
  // connection is available (set DB_* env vars and redeploy).
  try {
    await connectDatabase();
    await runSeeders();
    app.locals.dbReady = true;
    logger.info("Database connected and schema is ready");
  } catch (err) {
    app.locals.dbReady = false;
    const e = err as { parent?: { code?: string }; code?: string; name?: string };
    app.locals.dbError = e?.parent?.code || e?.code || e?.name || "unknown";
    logger.error(
      "Database unavailable - API routes will fail until DB_* env vars are set correctly. " +
        "The server is still starting so the service stays healthy.",
      err
    );
  }

  if (env.nodeEnv !== "production" || process.env.RUN_JOBS === "true") {
    startJobs();
  }

  const server = app.listen(env.port, () => {
    logger.info(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
    if (env.nodeEnv !== "production") {
      logger.info(`Swagger docs on http://localhost:${env.port}/api-docs`);
    }
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      const { sequelize } = await import("./database/sequelize");
      await sequelize.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.error("Fatal error during bootstrap", err);
  process.exit(1);
});