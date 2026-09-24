import { Table, Column, DataType, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { SchoolClass } from "./SchoolClass";
import { Subject } from "./Subject";import { Branch } from "./Branch";


@Table({ tableName: "class_subjects" })
export class ClassSubject extends BaseModel {

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Unique("uq_class_subject")
  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @Unique("uq_class_subject")
  @ForeignKey(() => Subject)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  subjectId!: number;
}