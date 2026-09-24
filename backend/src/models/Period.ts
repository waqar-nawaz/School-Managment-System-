import { Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { SchoolClass } from "./SchoolClass";
import { Section } from "./Section";
import { Teacher } from "./Teacher";
import { Subject } from "./Subject";
import { Branch } from "./Branch";

@Table({ tableName: "periods" })
export class Period extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @ForeignKey(() => Section)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  sectionId!: number;

  @Column({ type: DataType.STRING(10), allowNull: false })
  dayOfWeek!: string; // MON..SUN

  @Column({ type: DataType.STRING(20) })
  startTime!: string;

  @Column({ type: DataType.STRING(20) })
  endTime!: string;

  @ForeignKey(() => Subject)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  subjectId!: number;

  @ForeignKey(() => Teacher)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  teacherId!: number;

  @Column({ type: DataType.STRING(120) })
  room!: string;
}

@Table({ tableName: "timetables" })
export class Timetable extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(160), allowNull: false })
  name!: string;

  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @ForeignKey(() => Section)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  sectionId!: number;

  @Column({ type: DataType.DATE })
  validFrom!: Date;

  @Column({ type: DataType.DATE })
  validTo!: Date;

  @Column({ type: DataType.JSON })
  weeklyGrid!: Record<string, unknown>;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}