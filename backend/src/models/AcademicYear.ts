import { Table, Column, Unique, DataType, Index, ForeignKey } from "sequelize-typescript";
import { Branch } from "./Branch";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "academic_years" })
export class AcademicYear extends BaseModel {
  @Unique("uq_academic_year_branch_name")
  @Column({ type: DataType.STRING(30), allowNull: false })
  name!: string; // e.g. "2025-2026"

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.DATE })
  startDate!: Date;

  @Column({ type: DataType.DATE })
  endDate!: Date;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isCurrent!: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isClosed!: boolean;
}