import { Table, Column, Unique, DataType, Index } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Branch } from "./Branch";

@Table({ tableName: "books" })
export class Book extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  isbn!: string;

  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.STRING(120) })
  author!: string;

  @Column({ type: DataType.STRING(120) })
  publisher!: string;

  @Column({ type: DataType.INTEGER })
  publishedYear!: number;

  @Column({ type: DataType.STRING(60) })
  category!: string;

  @Column({ type: DataType.STRING(60) })
  shelfLocation!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 1 })
  copies!: number;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  price!: number;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}