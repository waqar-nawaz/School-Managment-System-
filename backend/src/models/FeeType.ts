import { Table, Column, Unique, DataType } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";

@Table({ tableName: "fee_types" })
export class FeeType extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(30) })
  category!: string; // tuition | transport | hostel | misc

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
  amount!: number;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 1 })
  installments!: number;

  @Column({ type: DataType.STRING(30), defaultValue: "term" })
  billingCycle!: string; // term | monthly | yearly | one-time

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isMandatory!: boolean;
}