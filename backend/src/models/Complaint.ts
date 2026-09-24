import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "complaints" })
export class Complaint extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(40), allowNull: false })
  category!: string; // grievance | harassment | infrastructure | other

  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  description!: string;

  @Column({ type: DataType.ENUM("open", "in_progress", "resolved", "closed", "rejected"), defaultValue: "open" })
  status!: string;

  @Column({ type: DataType.STRING(50), defaultValue: "low" })
  priority!: string;

  @Column({ type: DataType.JSON })
  attachments!: string[];

  @Column({ type: DataType.TEXT })
  resolution!: string;

  @Column({ type: DataType.DATE })
  resolvedAt!: Date;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  submittedBy!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  assignedTo!: number;
}

@Table({ tableName: "inventory" })
export class InventoryItem extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.STRING(180), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(60) })
  category!: string;

  @Column({ type: DataType.STRING(80) })
  sku!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 0 })
  quantity!: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 0 })
  minQuantity!: number;

  @Column({ type: DataType.STRING(80) })
  unit!: string; // pcs | kg | set | box

  @Column({ type: DataType.DECIMAL(12, 2) })
  unitPrice!: number;

  @Column({ type: DataType.STRING(120) })
  supplier!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}

@Table({ tableName: "assets" })
export class Asset extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.STRING(40), allowNull: false })
  assetCode!: string;

  @Column({ type: DataType.STRING(180), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(60) })
  category!: string;

  @Column({ type: DataType.DATE })
  purchaseDate!: Date;

  @Column({ type: DataType.DECIMAL(12, 2) })
  purchasePrice!: number;

  @Column({ type: DataType.STRING(40) })
  location!: string;

  @Column({ type: DataType.STRING(120) })
  assignedTo!: string;

  @Column({ type: DataType.ENUM("in_use", "stored", "maintenance", "scrapped"), defaultValue: "in_use" })
  status!: string;

  @Column({ type: DataType.TEXT })
  notes!: string;
}