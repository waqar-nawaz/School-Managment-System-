import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "expenses" })
export class Expense extends BaseModel {
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(60) })
  category!: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false })
  amount!: number;

  @Column({ type: DataType.DATE })
  expensedOn!: Date;

  @Column({ type: DataType.JSON })
  attachment!: Record<string, unknown>;

  @Column({ type: DataType.TEXT })
  notes!: string;

  @Index
  @Column({ type: DataType.STRING(30), defaultValue: "approved" })
  status!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  createdBy!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  approvedBy!: number;
}