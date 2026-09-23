import { Sequelize, ModelCtor, DataType } from "sequelize-typescript";
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

/**
 * Add columns introduced after the first release, without a destructive
 * `sync({ alter: true })`. Safe to run on every boot across dialects.
 */
async function ensureColumns(): Promise<void> {
  const qi = sequelize.getQueryInterface();
  const wanted: Array<{ table: string; column: string; def: Record<string, unknown> }> = [
    { table: "students", column: "guardianName", def: { type: DataType.STRING(120) } },
    { table: "students", column: "guardianPhone", def: { type: DataType.STRING(30) } },
  ];
  for (const { table, column, def } of wanted) {
    try {
      const desc = await qi.describeTable(table);
      if (!desc[column]) {
        await qi.addColumn(table, column, def as never);
        logger.info(`Added column ${table}.${column}`);
      }
    } catch {
      /* table not created yet — sync handles it next boot */
    }
  }
}

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
  await ensureColumns();
}

export default sequelize;
