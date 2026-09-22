import { Table, Column, Unique, Index, DataType, HasMany } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "branches" })
export class Branch extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(180), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(255) })
  code!: string;

  @Column({ type: DataType.STRING(255) })
  address!: string;

  @Column({ type: DataType.STRING(120) })
  city!: string;

  @Column({ type: DataType.STRING(120) })
  state!: string;

  @Column({ type: DataType.STRING(10) })
  country!: string;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Column({ type: DataType.STRING(180) })
  website!: string;

  @Column({ type: DataType.STRING(20) })
  postalCode!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @Column({ type: DataType.JSON })
  metadata!: Record<string, unknown>;
}