import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "visitor_logs" })
export class VisitorLog extends BaseModel {
  @Column({ type: DataType.STRING(120), allowNull: false })
  visitorName!: string;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(120) })
  purpose!: string;

  @Column({ type: DataType.STRING(120) })
  personToSee!: string;

  @Index
  @Column({ type: DataType.DATE, allowNull: false })
  checkedIn!: Date;

  @Column({ type: DataType.DATE })
  checkedOut!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isApproved!: boolean;

  @Column({ type: DataType.TEXT })
  notes!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  registeredBy!: number;
}