import { Table, Column, Unique, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "certificates" })
export class Certificate extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(40), allowNull: false })
  certNo!: string;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.STRING(40), allowNull: false })
  type!: string; // transfer | character | bonafide | provisional | mark_sheet

  @Column({ type: DataType.STRING(180) })
  title!: string;

  @Column({ type: DataType.TEXT })
  body!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  issuedOn!: Date;

  @Column({ type: DataType.JSON })
  generatedFrom!: Record<string, unknown>;

  @Column({ type: DataType.STRING(60) })
  signedBy!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isVerified!: boolean;
}

@Table({ tableName: "health_records" })
export class HealthRecord extends BaseModel {
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.STRING(10) })
  bloodGroup!: string;

  @Column({ type: DataType.JSON })
  allergies!: string[];

  @Column({ type: DataType.JSON })
  immunizations!: Record<string, unknown>[];

  @Column({ type: DataType.STRING(120) })
  medicalConditions!: string;

  @Column({ type: DataType.STRING(50) })
  insuranceNumber!: string;

  @Column({ type: DataType.DATE })
  lastCheckup!: Date;

  @Column({ type: DataType.JSON })
  checkupDetails!: Record<string, unknown>;
}

@Table({ tableName: "discipline_records" })
export class DisciplineRecord extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  type!: string; // warning | detention | suspension | praise

  @Column({ type: DataType.STRING(180) })
  title!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  recordedOn!: Date;

  @Column({ type: DataType.STRING(50) })
  status!: string;

  @Column({ type: DataType.TEXT })
  actionTaken!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  recordedBy!: number;
}