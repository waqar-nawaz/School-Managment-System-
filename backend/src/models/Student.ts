import { Table, Column, Unique, Index, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "students" })
export class Student extends BaseModel {
  @Unique
  @Index
  @Column({ type: DataType.STRING(30), allowNull: false })
  admissionNo!: string;

  @Column({ type: DataType.STRING(120) })
  firstName!: string;

  @Column({ type: DataType.STRING(120) })
  lastName!: string;

  @Column({ type: DataType.DATE })
  dateOfBirth!: Date;

  @Column({ type: DataType.ENUM("male", "female", "other") })
  gender!: string;

  @Column({ type: DataType.STRING(30) })
  bloodGroup!: string;

  @Column({ type: DataType.STRING(6) })
  religion!: string;

  @Column({ type: DataType.STRING(45) })
  nationality!: string;

  @Column({ type: DataType.STRING(20) })
  emergencyContact!: string;

  @Column({ type: DataType.STRING(120) })
  guardianName!: string;

  @Column({ type: DataType.STRING(30) })
  guardianPhone!: string;

  @Column({ type: DataType.TEXT })
  address!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Column({ type: DataType.STRING(255) })
  photo!: string;

  @Column({ type: DataType.DATE })
  admissionDate!: Date;

  @Column({ type: DataType.STRING(50), defaultValue: "new" })
  admissionStatus!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  currentClassId!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  currentSectionId!: number;

  @Column({ type: DataType.JSON })
  medicalInfo!: Record<string, unknown>;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  userId!: number;

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @BelongsTo(() => User)
  user!: User;
}