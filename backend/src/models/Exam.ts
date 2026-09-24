import { Table, Column, DataType, Index, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { AcademicYear } from "./AcademicYear";
import { Term } from "./Term";
import { Branch } from "./Branch";

@Table({ tableName: "exams" })
export class Exam extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.ENUM("weekly", "monthly", "midterm", "final", "quiz"), defaultValue: "midterm" })
  examType!: string;

  @ForeignKey(() => AcademicYear)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  academicYearId!: number;

  @ForeignKey(() => Term)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  termId!: number;

  @Column({ type: DataType.DATE })
  startDate!: Date;

  @Column({ type: DataType.DATE })
  endDate!: Date;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 100 })
  maxMarks!: number;

  @Index
  @Column({ type: DataType.ENUM("draft", "published", "completed", "cancelled"), defaultValue: "draft" })
  status!: string;

  @Column({ type: DataType.TEXT })
  description!: string;
}