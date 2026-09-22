import { Table, Column, Unique, Index, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "teachers" })
export class Teacher extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  staffNo!: string;

  @Column({ type: DataType.STRING(120) })
  firstName!: string;

  @Column({ type: DataType.STRING(120) })
  lastName!: string;

  @Column({ type: DataType.ENUM("male", "female", "other") })
  gender!: string;

  @Column({ type: DataType.DATE })
  dateOfBirth!: Date;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Column({ type: DataType.DATE })
  hireDate!: Date;

  @Column({ type: DataType.STRING(120) })
  qualification!: string;

  @Column({ type: DataType.STRING(120) })
  specialization!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  userId!: number;

  @BelongsTo(() => User)
  user!: User;
}