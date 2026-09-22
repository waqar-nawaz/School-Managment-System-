import { Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Exam } from "./Exam";
import { SchoolClass } from "./SchoolClass";
import { Section } from "./Section";
import { Subject } from "./Subject";

@Table({ tableName: "exam_schedules" })
export class ExamSchedule extends BaseModel {
  @ForeignKey(() => Exam)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  examId!: number;

  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  classId!: number;

  @ForeignKey(() => Section)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  sectionId!: number;

  @ForeignKey(() => Subject)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  subjectId!: number;

  @Column({ type: DataType.DATE })
  date!: Date;

  @Column({ type: DataType.STRING(20) })
  startTime!: string;

  @Column({ type: DataType.STRING(20) })
  endTime!: string;

  @Column({ type: DataType.STRING(80) })
  room!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  maxMarks!: number;
}