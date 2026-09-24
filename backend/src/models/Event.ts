import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";
import { Branch } from "./Branch";

@Table({ tableName: "events" })
export class Event extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT })
  description!: string;

  @Column({ type: DataType.STRING(50), defaultValue: "general" })
  category!: string; // general | sports | cultural | exam | holiday

  @Column({ type: DataType.DATE, allowNull: false })
  startAt!: Date;

  @Column({ type: DataType.DATE })
  endAt!: Date;

  @Column({ type: DataType.STRING(180) })
  venue!: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  allDay!: boolean;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isPublic!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  createdBy!: number;
}

@Table({ tableName: "notices" })
export class Notice extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  body!: string;

  @Column({ type: DataType.STRING(40), defaultValue: "notice" })
  type!: string; // notice | circular | urgent

  @Column({ type: DataType.DATE })
  publishDate!: Date;

  @Column({ type: DataType.DATE })
  expiryDate!: Date;

  @Column({ type: DataType.JSON })
  targetRoles!: string[];

  @Column({ type: DataType.JSON })
  targetClasses!: number[];

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isPublished!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  createdBy!: number;
}

@Table({ tableName: "announcements" })
export class Announcement extends BaseModel {
  @ForeignKey(() => Branch)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  branchId!: number;
  @Column({ type: DataType.STRING(180), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT })
  body!: string;

  @Column({ type: DataType.STRING(50), defaultValue: "info" })
  priority!: string; // info | important | critical

  @Column({ type: DataType.DATE, allowNull: false })
  startsAt!: Date;

  @Column({ type: DataType.DATE })
  endsAt!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isPinned!: boolean;

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  isActive!: boolean;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  createdBy!: number;
}