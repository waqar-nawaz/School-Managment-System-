import { Table, Column, Unique, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Book } from "./Book";
import { Branch } from "./Branch";

@Table({ tableName: "book_copies" })
export class BookCopy extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  accessionNo!: string;

  @ForeignKey(() => Book)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  bookId!: number;

  @Column({ type: DataType.ENUM("available", "issued", "reserved", "damaged", "lost"), defaultValue: "available" })
  status!: string;
}