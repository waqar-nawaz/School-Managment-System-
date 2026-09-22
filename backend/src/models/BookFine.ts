import { Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { BookIssue } from "./BookIssue";
import { User } from "./User";

@Table({ tableName: "book_fines" })
export class BookFine extends BaseModel {
  @ForeignKey(() => BookIssue)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  bookIssueId!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  userId!: number;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  amount!: number;

  @Column({ type: DataType.TEXT })
  reason!: string;

  @Column({ type: DataType.DATE })
  paidAt!: Date;

  @Column({ type: DataType.STRING(40) })
  receiptNo!: string;

  @Column({ type: DataType.ENUM("pending", "paid", "waived"), defaultValue: "pending" })
  status!: string;
}