import { Table, Column, DataType, Index, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "parents" })
export class Parent extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Column({ type: DataType.STRING(120) })
  title!: string;

  @Column({ type: DataType.STRING(120) })
  fullName!: string;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Column({ type: DataType.STRING(120) })
  occupation!: string;

  @Column({ type: DataType.TEXT })
  address!: string;

  @Column({ type: DataType.STRING(50) })
  relation!: string; // father | mother | guardian

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  userId!: number;

  @BelongsTo(() => User)
  user!: User;
}