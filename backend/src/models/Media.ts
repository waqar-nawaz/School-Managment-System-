import { Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "media" })
export class Media extends BaseModel {
  @Column({ type: DataType.STRING(180), allowNull: false })
  filename!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  path!: string;

  @Column({ type: DataType.STRING(120) })
  mimeType!: string;

  @Column({ type: DataType.INTEGER.UNSIGNED })
  size!: number;

  @Column({ type: DataType.STRING(40) })
  category!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  uploadedBy!: number;
}