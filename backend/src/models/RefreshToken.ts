import { Table, Column, DataType, Index, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "refresh_tokens" })
export class RefreshToken extends BaseModel {
  @Index
  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  userId!: number;

  @Index
  @Column({ type: DataType.STRING(64), allowNull: false })
  tokenHash!: string;

  @Column({ type: DataType.STRING(45) })
  ip!: string;

  @Column({ type: DataType.TEXT })
  userAgent!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  revoked!: boolean;

  @Column({ type: DataType.DATE })
  revokedAt!: Date;

  @BelongsTo(() => User)
  user!: User;
}