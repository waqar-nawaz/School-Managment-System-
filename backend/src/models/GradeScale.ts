import { Table, Column, Unique, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Branch } from "./Branch";

@Table({ tableName: "grade_scales" })
export class GradeScale extends BaseModel {
  @Unique("uq_grade_scale_branch_grade")
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  branchId!: number;
  @Column({ type: DataType.STRING(50), allowNull: false })
  name!: string;

  @Column({ type: DataType.FLOAT, allowNull: false })
  minPercentage!: number;

  @Column({ type: DataType.FLOAT, allowNull: false })
  maxPercentage!: number;

  @Unique("uq_grade_scale_branch_grade")
  @Column({ type: DataType.STRING(10), allowNull: false })
  grade!: string;

  @Column({ type: DataType.STRING(30), defaultValue: "PASS" })
  result!: string;

  @Column({ type: DataType.TEXT })
  description!: string;
}