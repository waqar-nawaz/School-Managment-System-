import { Table, Column, DataType, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Parent } from "./Parent";

@Table({ tableName: "student_guardians" })
export class StudentGuardian extends BaseModel {
  @Unique("uq_student_parent")
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Unique("uq_student_parent")
  @ForeignKey(() => Parent)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  parentId!: number;

  @Column({ type: DataType.STRING(30), defaultValue: "guardian" })
  relation!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isPrimary!: boolean;
}