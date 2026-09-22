import { Sequelize, ModelCtor } from "sequelize-typescript";
import env from "../config";
import { logger } from "../config/logger";
import { models } from "../models";

export const sequelize = new Sequelize({
  dialect: "mysql",
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  username: env.db.user,
  password: env.db.pass,
  timezone: "+00:00",
  logging: (msg: string) => logger.debug(msg),
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    underscored: false,
    freezeTableName: false,
  },
  pool: {
    max: 15,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  models: models as ModelCtor[],
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
}

export default sequelize;