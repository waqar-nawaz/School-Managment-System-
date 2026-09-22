import { Table, Column, Unique, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Term } from "./Term";
import { Enrolment } from "./Enrolment";

@Table({ tableName: "invoices" })
export class Invoice extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(40), allowNull: false })
  invoiceNo!: string;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Enrolment)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  enrolmentId!: number;

  @ForeignKey(() => Term)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  termId!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  amount!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  discount!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  tax!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  totalDue!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  amountPaid!: number;

  @Column({ type: DataType.DATE })
  dueDate!: Date;

  @Column({ type: DataType.DATE })
  issueDate!: Date;

  @Index
  @Column({ type: DataType.ENUM("pending", "partial", "paid", "overdue", "cancelled"), defaultValue: "pending" })
  status!: string;

  @Column({ type: DataType.JSON })
  lineItems!: Record<string, unknown>[];
}