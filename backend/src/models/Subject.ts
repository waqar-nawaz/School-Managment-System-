import { Table, Column, Unique, DataType } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "subjects" })
export class Subject extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(10) })
  code!: string;

  @Column({ type: DataType.STRING(255) })
  description!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 100 })
  maxMarks!: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 35 })
  passMarks!: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}