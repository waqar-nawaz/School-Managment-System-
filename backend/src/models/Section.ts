import { Table, Column, Unique, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { SchoolClass } from "./SchoolClass";

@Table({ tableName: "sections" })
export class Section extends BaseModel {
  @Unique("uq_section_class_name")
  @Column({ type: DataType.STRING(20), allowNull: false })
  name!: string; // e.g. "A"

  @Unique("uq_section_class_name")
  @ForeignKey(() => SchoolClass)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  classId!: number;

  @Index
  @Column({ type: DataType.INTEGER.UNSIGNED, defaultValue: 0 })
  capacity!: number;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;
}