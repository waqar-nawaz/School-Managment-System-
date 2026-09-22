import { Table, Column, Unique, DataType, Index } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "academic_years" })
export class AcademicYear extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  name!: string; // e.g. "2025-2026"

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