import env from "./config";
import { logger } from "./config/logger";
import app from "./app";
import { connectDatabase } from "./database/sequelize";
import { defineAssociations } from "./models";
import { runSeeders } from "./database/seeders";
import { startJobs } from "./jobs";

async function bootstrap(): Promise<void> {
  defineAssociations();
  await connectDatabase();
  await runSeeders();

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