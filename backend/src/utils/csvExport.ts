import { Request, Response } from "express";
import { Model, ModelStatic } from "sequelize";
import { asyncHandler } from "./asyncHandler";
import { CrudHandlers } from "./crudFactory";
import { writeAuditLog } from "../services/audit.service";

/** Neutralise spreadsheet formulas (=, +, -, @) so opened CSVs can't run code in Excel. */
function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

export function exportCsv(model: ModelStatic<Model>, resourcePath: string, ctrl: CrudHandlers) {
  return asyncHandler(async (req: Request, res: Response) => {
    // Same filters, search, branch scope and row-level scope as the list screen.
    const where = await ctrl.buildWhere(req);
    const hidden = new Set([
      "passwordHash", "passwordChangedAt", "secret", "tokenHash", "lastLoginIp", "deletedAt", "userAgent",
      ...ctrl.hiddenColumns(req),
    ]);
    const attrs = Object.keys((model as any).rawAttributes || {}).filter((a) => !hidden.has(a));
    const rows = await model.findAll({ where, limit: 5000, raw: true, attributes: attrs });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${resourcePath}-${Date.now()}.csv"`);
    if (!rows.length) {
      res.send(attrs.join(","));
      return;
    }
    const csv = [
      attrs.join(","),
      ...rows.map((r: any) => attrs.map((h) => csvCell(r[h])).join(",")),
    ].join("\r\n");
    // Report truncation so clients know the export is incomplete.
    if (rows.length === 5000) {
      res.setHeader("X-Export-Truncated", "true");
      res.setHeader("X-Export-Max-Rows", "5000");
    }
    res.send("\uFEFF" + csv); // BOM so Excel reads UTF-8 (Urdu names) correctly

    await writeAuditLog({
      action: "export",
      entity: resourcePath,
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
      role: req.user?.role,
      ip: req.ip,
      newData: { format: "csv", rowCount: rows.length, truncated: rows.length === 5000 },
    });
  });
}

