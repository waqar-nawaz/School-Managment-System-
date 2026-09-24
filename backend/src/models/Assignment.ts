import { Table, Column, DataType, Index, ForeignKey, BelongsTo } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Teacher } from "./Teacher";import { Branch } from "./Branch";


@Table({ tableName: "assignments" })
export class Assignment extends BaseModel {

  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(160), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Column({ type: DataType.TEXT })
  instructions!: string;

  @Column({ type: DataType.DATE })
  dueDate!: Date;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  maxMarks!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  classId!: number;

  @Column({ type: DataType.BIGINT.UNSIGNED })
  subjectId!: number;

  @Column({ type: DataType.STRING(255) })
  attachment!: string;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isPublished!: boolean;

  @ForeignKey(() => Teacher)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  createdBy!: number;

  @BelongsTo(() => Teacher)
  teacher!: Teacher;
}