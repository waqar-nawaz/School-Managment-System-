import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Student } from "./Student";
import { Branch } from "./Branch";

@Table({ tableName: "hostels" })
export class Hostel extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.ENUM("boys", "girls", "coed") })
  gender!: string;

  @Column({ type: DataType.TEXT })
  address!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 0 })
  capacity!: number;

  @Column({ type: DataType.STRING(120) })
  wardenName!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}

@Table({ tableName: "rooms" })
export class Room extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => Hostel)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  hostelId!: number;

  @Column({ type: DataType.STRING(30), allowNull: false })
  roomNo!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 4 })
  capacity!: number;

  @Column({ type: DataType.STRING(80) })
  floor!: string;

  @Index
  @Column({ type: DataType.ENUM("available", "full", "maintenance"), defaultValue: "available" })
  status!: string;
}

@Table({ tableName: "beds" })
export class Bed extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => Room)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  roomId!: number;

  @Column({ type: DataType.STRING(20), allowNull: false })
  bedNo!: string;

  @Column({ type: DataType.ENUM("available", "occupied", "maintenance"), defaultValue: "available" })
  status!: string;
}

@Table({ tableName: "hostel_allocations" })
export class HostelAllocation extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Hostel)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  hostelId!: number;

  @ForeignKey(() => Room)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  roomId!: number;

  @ForeignKey(() => Bed)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  bedId!: number;

  @Column({ type: DataType.DATE })
  checkIn!: Date;

  @Column({ type: DataType.DATE })
  checkOut!: Date;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  monthlyFee!: number;

  @Column({ type: DataType.ENUM("active", "checked_out", "transferred"), defaultValue: "active" })
  status!: string;
}