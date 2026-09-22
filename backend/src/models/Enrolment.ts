import { Table, Column, DataType, Index, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { AcademicYear } from "./AcademicYear";
import { SchoolClass } from "./SchoolClass";
import { Section } from "./Section";

@Table({ tableName: "enrolments" })
export class Enrolment extends BaseModel {
  @Unique("uq_enrolment_year_student")
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => AcademicYear)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  academicYearId!: number;

  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @ForeignKey(() => Section)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  sectionId!: number;

  @Column({ type: DataType.STRING(50) })
  rollNo!: string;

  @Column({ type: DataType.DATE })
  enrolledOn!: Date;

  @Index
  @Column({ type: DataType.ENUM("active", "promoted", "graduated", "transferred", "withdrawn", "expelled"), defaultValue: "active" })
  status!: string;
}