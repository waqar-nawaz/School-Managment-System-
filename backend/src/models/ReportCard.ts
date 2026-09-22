import { Table, Column, DataType, Index, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Term } from "./Term";
import { Enrolment } from "./Enrolment";

@Table({ tableName: "report_cards", indexes: [{ unique: true, fields: ["enrolmentId", "termId"] }] })
export class ReportCard extends BaseModel {
  @ForeignKey(() => Enrolment)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  enrolmentId!: number;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Term)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  termId!: number;

  @Column({ type: DataType.JSON })
  subjectWise!: Record<string, unknown>;

  @Column({ type: DataType.FLOAT })
  totalMarks!: number;

  @Column({ type: DataType.FLOAT })
  obtainedMarks!: number;

  @Column({ type: DataType.STRING(10) })
  grade!: string;

  @Column({ type: DataType.FLOAT })
  percentage!: number;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  rankInClass!: number;

  @Column({ type: DataType.TEXT })
  teacherRemarks!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isPublished!: boolean;
}