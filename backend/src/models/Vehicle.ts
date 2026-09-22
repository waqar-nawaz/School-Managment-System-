import { Table, Column, Unique, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Student } from "./Student";
import { Route, RouteStop } from "./Route";

@Table({ tableName: "vehicles" })
export class Vehicle extends BaseModel {
  @Unique
  @Column({ type: DataType.STRING(30), allowNull: false })
  registrationNo!: string;

  @Column({ type: DataType.STRING(80) })
  model!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  capacity!: number;

  @Column({ type: DataType.STRING(50) })
  fuelType!: string; // petrol | diesel | cng | electric

  @Column({ type: DataType.DATE })
  insuranceExpiry!: Date;

  @Column({ type: DataType.DATE })
  fitnessExpiry!: Date;

  @Index
  @Column({ type: DataType.ENUM("active", "maintenance", "inactive"), defaultValue: "active" })
  status!: string;
}

@Table({ tableName: "driver_assignments" })
export class DriverAssignment extends BaseModel {
  @ForeignKey(() => Vehicle)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  vehicleId!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  driverId!: number;

  @ForeignKey(() => Route)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  routeId!: number;

  @Column({ type: DataType.DATE })
  assignedOn!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}

@Table({ tableName: "student_transport" })
export class StudentTransport extends BaseModel {
  @ForeignKey(() => Student)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  studentId!: number;

  @ForeignKey(() => Route)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  routeId!: number;

  @ForeignKey(() => RouteStop)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  stopId!: number;

  @ForeignKey(() => Vehicle)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  vehicleId!: number;

  @Column({ type: DataType.DATE })
  startDate!: Date;

  @Column({ type: DataType.DATE })
  endDate!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}