import { Table, Column, Unique, Index, DataType, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";
import { Student } from "./Student";

@Table({ tableName: "admission_applications" })
export class AdmissionApplication extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  applicationNo!: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  studentName!: string;

  @Column({ type: DataType.DATE })
  dateOfBirth!: Date;

  @Column({ type: DataType.ENUM("male", "female", "other") })
  gender!: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  appliedClass!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.TEXT })
  address!: string;

  /** Parent / guardian who is applying (their phone and email are the contact fields above). */
  @Column({ type: DataType.STRING(120) })
  guardianName!: string;

  @Column({ type: DataType.STRING(30) })
  guardianRelation!: string;

  /** Set when the application was turned into a student. */
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  studentId!: number;

  @Column({ type: DataType.ENUM("enquiry", "applied", "shortlisted", "admitted", "rejected", "waitlisted", "withdrawn"), defaultValue: "enquiry" })
  status!: string;

  @Index
  @Column({ type: DataType.DATE })
  dateApplied!: Date;

  @Column({ type: DataType.TEXT })
  remarks!: string;

  @Column({ type: DataType.JSON })
  documents!: Record<string, unknown>;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  reviewedBy!: number;

  @BelongsTo(() => User)
  reviewer!: User;

}
