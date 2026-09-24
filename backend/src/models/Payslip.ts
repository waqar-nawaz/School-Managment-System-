import { Table, Column, Unique, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { PayrollItem } from "./PayrollItem";
import { Branch } from "./Branch";

@Table({ tableName: "payslips" })
export class Payslip extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Unique
  @Column({ type: DataType.STRING(40), allowNull: false })
  payslipNo!: string;

  @ForeignKey(() => PayrollItem)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  payrollItemId!: number;

  @Column({ type: DataType.JSON })
  earnings!: Record<string, unknown>[];

  @Column({ type: DataType.JSON })
  deductions!: Record<string, unknown>[];

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  gross!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  net!: number;

  @Column({ type: DataType.TEXT })
  notes!: string;
}