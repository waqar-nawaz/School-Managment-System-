import { Sequelize, ModelCtor } from "sequelize-typescript";
import env from "../config";
import { logger } from "../config/logger";
import { models } from "../models";

const commonOptions = {
  timezone: "+00:00",
  logging: (msg: string) => logger.debug(msg),
  pool: {
    max: 15,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  models: models as ModelCtor[],
} as const;

const dialectOptions = env.db.ssl
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : undefined;

export const sequelize = env.db.url
  ? new Sequelize(env.db.url, {
      dialect: env.db.dialect,
      dialectOptions,
      ...commonOptions,
    })
  : new Sequelize({
      dialect: env.db.dialect,
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
      username: env.db.user,
      password: env.db.pass,
      dialectOptions,
      define:
        env.db.dialect === "mysql"
          ? {
              charset: "utf8mb4",
              collate: "utf8mb4_unicode_ci",
              underscored: false,
              freezeTableName: false,
            }
          : { underscored: false, freezeTableName: false },
      ...commonOptions,
    });

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
}

export default sequelize;
