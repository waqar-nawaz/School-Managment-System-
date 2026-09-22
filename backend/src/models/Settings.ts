import { Table, Column, Unique, DataType, Index } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "settings" })
export class Settings extends BaseModel {
  @Unique("uq_settings_scope_key")
  @Column({ type: DataType.STRING(60), allowNull: false, defaultValue: "system" })
  scope!: string;

  @Unique("uq_settings_scope_key")
  @Column({ type: DataType.STRING(120), allowNull: false })
  key!: string;

  @Column({ type: DataType.TEXT })
  value!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isPublic!: boolean;
}