import {
  Table,
  Column,
  Unique,
  Index,
  DataType,
  ForeignKey,
  BelongsTo,
} from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Role } from "./Role";
import { Branch } from "./Branch";

@Table({ tableName: "users", underscored: false })
export class User extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(120), allowNull: false })
  username!: string;

  @Unique
  @Index
  @Column({ type: DataType.STRING(180), allowNull: false })
  email!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  passwordHash!: string;

  @Column({ type: DataType.STRING(120) })
  firstName!: string;

  @Column({ type: DataType.STRING(120) })
  lastName!: string;

  @Column({ type: DataType.ENUM("male", "female", "other") })
  gender!: string;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(255) })
  avatar!: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "staff" })
  role!: string;

  @Column({ type: DataType.STRING(5), defaultValue: "en" })
  locale!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  emailVerified!: boolean;

  @Column({ type: DataType.DATE })
  lastLoginAt!: Date;

  @Column({ type: DataType.STRING(45) })
  lastLoginIp!: string;

  @Column({ type: DataType.DATE })
  passwordChangedAt!: Date;

  @Column({ type: DataType.DATE })
  deletedAt!: Date;

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @BelongsTo(() => Branch)
  branch!: Branch;

  // Related profile (teacher/student/parent) resolved at runtime.
  profileId!: number | null;
}