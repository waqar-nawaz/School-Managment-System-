import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Branch } from "./Branch";

@Table({ tableName: "routes" })
export class Route extends BaseModel {
  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(120) })
  startPoint!: string;

  @Column({ type: DataType.STRING(120) })
  endPoint!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  monthlyFee!: number;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
}

@Table({ tableName: "route_stops" })
export class RouteStop extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;

  @ForeignKey(() => Route)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  routeId!: number;

  @Column({ type: DataType.STRING(180), allowNull: false })
  name!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED, allowNull: false })
  orderIndex!: number;

  @Column({ type: DataType.STRING(12) })
  pickupTime!: string;

  @Column({ type: DataType.STRING(12) })
  dropTime!: string;

  @Column({ type: DataType.DECIMAL(12, 2), defaultValue: 0 })
  stopFee!: number;
}