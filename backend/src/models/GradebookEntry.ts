import { Table, Column, DataType, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Term } from "./Term";
import { Subject } from "./Subject";

@Table({ tableName: "gradebook_entries", indexes: [{ unique: true, fields: ["studentId", "termId", "subjectId"] }] })
export class GradebookEntry extends BaseModel {
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Term)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  termId!: number;

  @ForeignKey(() => Subject)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  subjectId!: number;

  @Column({ type: DataType.FLOAT })
  continuousAvg!: number;

  @Column({ type: DataType.FLOAT })
  examScore!: number;

  @Column({ type: DataType.FLOAT })
  total!: number;

  @Column({ type: DataType.STRING(10) })
  grade!: string;

  @Column({ type: DataType.STRING(120) })
  teacherComment!: string;
}