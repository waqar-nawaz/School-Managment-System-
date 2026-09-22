import { Table, Column, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";

@Table({ tableName: "attendance", indexes: [{ unique: true, fields: ["studentId", "date"] }] })
export class Attendance extends BaseModel {
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.DATEONLY, allowNull: false })
  date!: string;

  @Column({ type: DataType.ENUM("present", "absent", "late", "excused", "holiday"), defaultValue: "present" })
  status!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  lateMinutes!: number;

  @Column({ type: DataType.TEXT })
  reason!: string;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  takenBy!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  classId!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  sectionId!: number;
}