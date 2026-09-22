import { Table, Column, Unique, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Invoice } from "./Invoice";
import { User } from "./User";

@Table({ tableName: "payments" })
export class Payment extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(40), allowNull: false })
  receiptNo!: string;

  @ForeignKey(() => Invoice)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  invoiceId!: number;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  amount!: number;

  @Column({ type: DataType.STRING(30), defaultValue: "cash" })
  method!: string; // cash | card | bank | mobile | online

  @Column({ type: DataType.STRING(120) })
  reference!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  paidOn!: Date;

  @Index
  @Column({ type: DataType.ENUM("successful", "failed", "refunded", "reversed"), defaultValue: "successful" })
  status!: string;

  @Column({ type: DataType.TEXT })
  notes!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  recordedBy!: number;
}