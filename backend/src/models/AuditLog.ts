import { Table, Column, Index, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "audit_logs" })
export class AuditLog extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  userId!: number;

  @Column({ type: DataType.STRING(50) })
  role!: string;

  @Index
  @Column({ type: DataType.STRING(120) })
  action!: string; // create | update | delete | login | export

  @Column({ type: DataType.STRING(120) })
  entity!: string;

  @Column({ type: DataType.STRING(64) })
  entityId!: string;

  @Column({ type: DataType.STRING(45) })
  ip!: string;

  @Column({ type: DataType.STRING(255) })
  userAgent!: string;

  @Column({ type: DataType.JSON })
  oldData!: Record<string, unknown>;

  @Column({ type: DataType.JSON })
  newData!: Record<string, unknown>;
}