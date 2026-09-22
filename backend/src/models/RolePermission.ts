import { Table, Column, DataType, ForeignKey, Unique } from "sequelize-typescript";
import { BaseModel } from "./BaseModel";
import { Role } from "./Role";
import { Permission } from "./Permission";

@Table({ tableName: "role_permissions" })
export class RolePermission extends BaseModel {
  @Unique("uq_role_perm")
  @ForeignKey(() => Role)
  @Column({ type: DataType.STRING(50), allowNull: false })
  roleId!: string;

  @Unique("uq_role_perm")
  @ForeignKey(() => Permission)
  @Column({ type: DataType.STRING(120), allowNull: false })
  permissionKey!: string;
}