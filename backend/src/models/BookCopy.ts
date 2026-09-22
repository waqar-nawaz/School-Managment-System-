import { Table, Column, Unique, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Book } from "./Book";

@Table({ tableName: "book_copies" })
export class BookCopy extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  accessionNo!: string;

  @ForeignKey(() => Book)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  bookId!: number;

  @Column({ type: DataType.ENUM("available", "issued", "reserved", "damaged", "lost"), defaultValue: "available" })
  status!: string;
}