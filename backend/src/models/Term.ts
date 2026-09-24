import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { AcademicYear } from "./AcademicYear";
import { Branch } from "./Branch";

@Table({ tableName: "terms" })
export class Term extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @ForeignKey(() => AcademicYear)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  academicYearId!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  name!: string; // e.g. "Term 1"

  @Column({ type: DataType.DATE })
  startDate!: Date;

  @Column({ type: DataType.DATE })
  endDate!: Date;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isCurrent!: boolean;
}