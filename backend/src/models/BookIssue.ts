import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { BookCopy } from "./BookCopy";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "book_issues" })
export class BookIssue extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Index
  @ForeignKey(() => BookCopy)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  bookCopyId!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  userId!: number;

  @Column({ type: DataType.DATE, allowNull: false })
  issueDate!: Date;

  @Column({ type: DataType.DATE })
  dueDate!: Date;

  @Column({ type: DataType.DATE })
  returnDate!: Date;

  @Column({ type: DataType.STRING(50) })
  requestedFor!: string; // student | teacher | staff

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  fine!: number;

  @Index
  @Column({ type: DataType.ENUM("requested", "issued", "returned", "overdue", "lost"), defaultValue: "requested" })
  status!: string;
}