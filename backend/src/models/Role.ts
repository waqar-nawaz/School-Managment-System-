import { Table, Column, Unique, DataType, HasMany } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "roles" })
export class Role extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(50), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(120) })
  label!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isSystem!: boolean;
}