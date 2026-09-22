import { Table, Column, DataType, Index, ForeignKey } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { User } from "./User";

@Table({ tableName: "messages" })
export class Message extends BaseModel {
  @Column({ type: DataType.STRING(180) })
  subject!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  body!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  senderId!: number;

  @Column({ type: DataType.STRING(30), defaultValue: "direct" })
  kind!: string; // direct | broadcast | group

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isGroup!: boolean;

  @Column({ type: DataType.JSON })
  attachments!: string[];

  @Index
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isArchived!: boolean;

  @ForeignKey(() => Message)
  @Column({ type: DataType.BIGINT.UNSIGNED })
  threadId!: number;
}

@Table({ tableName: "message_recipients" })
export class MessageRecipient extends BaseModel {
  @ForeignKey(() => Message)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  messageId!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  recipientId!: number;

  @Column({ type: DataType.DATE })
  readAt!: Date;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isDeleted!: boolean;
}

@Table({ tableName: "notifications" })
export class Notification extends BaseModel {
  @ForeignKey(() => User)
  @Column({ type: DataType.BIGINT.UNSIGNED, allowNull: false })
  userId!: number;

  @Column({ type: DataType.STRING(40), defaultValue: "system" })
  channel!: string; // system | email | sms | push

  @Column({ type: DataType.STRING(180) })
  title!: string;

  @Column({ type: DataType.TEXT })
  body!: string;

  @Column({ type: DataType.JSON })
  data!: Record<string, unknown>;

  @Index
  @Column({ type: DataType.DATE })
  readAt!: Date;
}