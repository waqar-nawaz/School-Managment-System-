import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Teacher } from "./Teacher";
import { Staff } from "./Staff";
import { Branch } from "./Branch";

@Table({ tableName: "payroll_items" })
export class PayrollItem extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(20), allowNull: false })
  month!: string; // YYYY-MM

  @Column({ type: DataType.STRING(30), defaultValue: "teacher" })
  payeeType!: string; // teacher | staff

  @ForeignKey(() => Teacher)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  teacherId!: number;

  @ForeignKey(() => Staff)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  staffId!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  basicSalary!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  allowances!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  deductions!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  netPay!: number;

  @Column({ type: DataType.STRING(30), defaultValue: "bank" })
  paymentMethod!: string;

  @Index
  @Column({ type: DataType.ENUM("draft", "approved", "paid"), defaultValue: "draft" })
  status!: string;

  @Column({ type: DataType.DATE })
  paidOn!: Date;
}