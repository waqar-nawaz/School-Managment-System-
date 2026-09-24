import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "leave_requests" })
export class LeaveRequest extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(50), allowNull: false })
  leaveType!: string; // sick | casual | annual | unpaid | maternity

  @Column({ type: DataType.DATE, allowNull: false })
  startDate!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  endDate!: Date;

  @Column({ type: DataType.FLOAT, defaultValue: 1 })
  days!: number;

  @Column({ type: DataType.TEXT })
  reason!: string;

  @Index
  @Column({ type: DataType.ENUM("pending", "approved", "rejected", "cancelled"), defaultValue: "pending" })
  status!: string;

  @Column({ type: DataType.TEXT })
  adminComment!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  processedBy!: number;
}