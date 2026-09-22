import { Table, Column, Unique, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Branch } from "./Branch";

@Table({ tableName: "classes" })
export class SchoolClass extends BaseModel {
  @Unique("uq_class_branch_name")
  @Column({ type: DataType.STRING(80), allowNull: false })
  name!: string; // e.g. "Grade 5"

  @Unique("uq_class_branch_name")
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.STRING(20) })
  level!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 0 })
  capacity!: number;

  @Column({ type: DataType.STRING(255) })
  room!: string;
}