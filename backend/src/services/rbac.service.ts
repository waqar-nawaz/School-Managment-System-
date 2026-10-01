import { Settings, RolePermission } from "../models";
import { permissionsForRole } from "../config/permissions";

/**
 * Effective permissions per role.
 *
 * - A role that was never customised uses the built-in defaults from config/permissions.ts.
 * - Once someone saves a role in the Roles & Permissions screen we store a marker
 *   (settings scope "rbac", key = role) and from then on the DB rows are the source of truth.
 *
 * Results are cached briefly; call invalidateRbac() after any change.
 */
const TTL_MS = 30_000;
let cache: { at: number; custom: Map<string, string[]> } | null = null;

async function loadCustom(): Promise<Map<string, string[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.custom;
  const markers = await Settings.findAll({ where: { scope: "rbac" }, attributes: ["key"] });
  const custom = new Map<string, string[]>();
  if (markers.length) {
    const roles = markers.map((m) => m.key);
    const rows = await RolePermission.findAll({ where: { roleId: roles } });
    for (const r of roles) custom.set(r, []);
    for (const row of rows) custom.get(row.roleId)!.push(row.permissionKey);
  }
  cache = { at: Date.now(), custom };
  return custom;
}

export function invalidateRbac(): void {
  cache = null;
}

export async function getPermissionsForRole(role: string): Promise<string[]> {
  // super_admin can never be locked out, whatever the matrix says.
  if (role === "super_admin") return ["*"];
  const custom = await loadCustom();
  return custom.get(role) ?? permissionsForRole(role);
}

export async function markRoleCustomised(role: string): Promise<void> {
  await Settings.upsert({ scope: "rbac", key: role, value: "custom", description: "role permissions customised" } as any);
  invalidateRbac();
}
