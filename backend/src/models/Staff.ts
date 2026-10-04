import { Table, Column, Unique, DataType, Index, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "staff" })
export class Staff extends BaseModel {
  @Unique("uq_staff_branch_staff_no")
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  branchId!: number;

  @Unique("uq_staff_branch_staff_no")
  @Column({ type: DataType.STRING(30), allowNull: false })
  staffNo!: string;

  @Column({ type: DataType.STRING(120) })
  firstName!: string;

  @Column({ type: DataType.STRING(120) })
  lastName!: string;

  @Column({ type: DataType.ENUM("male", "female", "other") })
  gender!: string;

  @Column({ type: DataType.STRING(120) })
  department!: string;

  @Column({ type: DataType.STRING(120) })
  designation!: string;

  /** What kind of employee: teacher, staff, hostel_warden, accountant, librarian, etc. */
  @Index
  @Column({ type: DataType.STRING(30), defaultValue: "staff" })
  employeeType!: string;

  @Column({ type: DataType.DATE })
  hireDate!: Date;

  @Column({ type: DataType.STRING(20) })
  phone!: string;

  @Column({ type: DataType.STRING(180) })
  email!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  userId!: number;

  @BelongsTo(() => User)
  user!: User;
}