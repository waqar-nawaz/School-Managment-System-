import { Table, Column, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Payment } from "./Payment";
import { Invoice } from "./Invoice";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "refunds" })
export class Refund extends BaseModel {
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

  @Column({ type: DataType.STRING(50), defaultValue: "bank" })
  method!: string;

  @Column({ type: DataType.TEXT })
  reason!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  refundedOn!: Date;

  @Column({ type: DataType.ENUM("pending", "processed", "rejected"), defaultValue: "pending" })
  status!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  approvedBy!: number;
}