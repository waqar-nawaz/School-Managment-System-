import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { SchoolClass } from "./SchoolClass";

@Table({ tableName: "syllabus" })
export class Syllabus extends BaseModel {
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  subjectId!: number;

  @Column({ type: DataType.STRING(255) })
  resourceFile!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Index
  @Column({ type: DataType.DATE })
  publishedAt!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isPublished!: boolean;
}

@Table({ tableName: "lesson_plans" })
export class LessonPlan extends BaseModel {
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  subjectId!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  classId!: number;

  @Column({ type: DataType.TEXT })
  objectives!: string;

  @Column({ type: DataType.TEXT })
  materials!: string;

  @Column({ type: DataType.JSON })
  activities!: Record<string, unknown>[];

  @Column({ type: DataType.JSON })
  assessment!: Record<string, unknown>;

  @Column({ type: DataType.DATE })
  plannedDate!: Date;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  teacherId!: number;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isCompleted!: boolean;
}