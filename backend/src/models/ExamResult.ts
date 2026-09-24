import { Table, Column, DataType, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Exam } from "./Exam";
import { Student } from "./Student";
import { Subject } from "./Subject";
import { Branch } from "./Branch";

@Table({ tableName: "exam_results", indexes: [{ unique: true, fields: ["examId", "studentId", "subjectId"] }] })
export class ExamResult extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @ForeignKey(() => Exam)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  examId!: number;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Subject)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  subjectId!: number;

  @Column({ type: DataType.FLOAT })
  marksObtained!: number;

  @Column({ type: DataType.FLOAT })
  maxMarks!: number;

  @Column({ type: DataType.STRING(10) })
  grade!: string;

  @Column({ type: DataType.TEXT })
  remarks!: string;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  enteredBy!: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isVerified!: boolean;
}