import { Table, Column, Unique, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Payment } from "./Payment";
import { Invoice } from "./Invoice";
import { Branch } from "./Branch";

@Table({ tableName: "receipts" })
export class Receipt extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(40), allowNull: false })
  receiptNo!: string;

  @ForeignKey(() => Payment)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  paymentId!: number;

  @ForeignKey(() => Invoice)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  invoiceId!: number;

  // Multi-tenant scope.
  @ForeignKey(() => Branch)
  @Index
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  amount!: number;

  @Column({ type: DataType.STRING(80) })
  headline!: string;

  @Column({ type: DataType.TEXT })
  body!: string;

  @Column({ type: DataType.STRING(30) })
  currency!: string;
}