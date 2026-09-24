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
    { table: "academic_years", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "terms", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "subjects", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "sections", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "students", column: "guardianName", def: { type: DataType.STRING(120) } },
    { table: "students", column: "guardianPhone", def: { type: DataType.STRING(30) } },
    { table: "inventory", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "assets", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "discipline_records", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "route_stops", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "vehicles", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "driver_assignments", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "student_transport", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "events", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "notices", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "announcements", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "enrolments", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "exam_results", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "exams", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "exam_schedules", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "report_cards", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "assignments", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "submissions", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "gradebook_entries", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "periods", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "timetables", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "class_subjects", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "fee_types", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "expenses", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "payroll_items", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "payslips", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "grade_scales", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "syllabus", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "lesson_plans", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "certificates", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "hostels", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "rooms", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "beds", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "hostel_allocations", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "health_records", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "complaints", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "visitor_logs", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "attendance", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "leave_requests", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "messages", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "message_recipients", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
    { table: "notifications", column: "branchId", def: { type: DataType.BIGINT.UNSIGNED } },
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
