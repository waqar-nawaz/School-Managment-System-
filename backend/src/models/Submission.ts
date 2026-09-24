import { Table, Column, DataType, ForeignKey, Unique, Index } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Assignment } from "./Assignment";
import { Student } from "./Student";import { Branch } from "./Branch";


@Table({ tableName: "submissions", indexes: [{ unique: true, fields: ["assignmentId", "studentId"] }] })
export class Submission extends BaseModel {

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => Assignment)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  assignmentId!: number;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.TEXT })
  content!: string;

  @Column({ type: DataType.JSON })
  attachments!: string[];

  @Column({ type: DataType.DATE })
  submittedAt!: Date;

  @Column({ type: DataType.FLOAT })
  marksAwarded!: number;

  @Column({ type: DataType.TEXT })
  feedback!: string;

  @Index
  @Column({ type: DataType.ENUM("submitted", "graded", "returned", "late"), defaultValue: "submitted" })
  status!: string;
}