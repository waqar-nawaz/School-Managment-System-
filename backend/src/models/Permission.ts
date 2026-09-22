import { Table, Column, Unique, DataType, Index } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "permissions" })
export class Permission extends BaseModel {
  @Unique
  @Index
  @Column({ type: DataType.STRING(120), allowNull: false })
  key!: string; // e.g. students:create

  @Column({ type: DataType.STRING(180) })
  label!: string;

  @Column({ type: DataType.STRING(60) })
  category!: string; // e.g. students
}