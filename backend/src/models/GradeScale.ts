import { Table, Column, Unique, DataType } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "grade_scales" })
export class GradeScale extends BaseModel {
  @Column({ type: DataType.STRING(50), allowNull: false })
  name!: string;

  @Column({ type: DataType.FLOAT, allowNull: false })
  minPercentage!: number;

  @Column({ type: DataType.FLOAT, allowNull: false })
  maxPercentage!: number;

  @Unique
  @Column({ type: DataType.STRING(10), allowNull: false })
  grade!: string;

  @Column({ type: DataType.STRING(30), defaultValue: "PASS" })
  result!: string;

  @Column({ type: DataType.TEXT })
  description!: string;
}