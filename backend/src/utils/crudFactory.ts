import { Model, ModelCtor, WhereOptions, Op, Order, FindOptions } from "sequelize";
import { Request, Response } from "express";
import { ApiError } from "./ApiError";
import { ApiResponse, PaginationMeta } from "./ApiResponse";
import { parsePagination, buildPaginationMeta } from "./pagination";
import { likeOp } from "./search";

export interface CrudOptions<M extends Model = Model> {
  model: ModelCtor<M>;
  searchable: string[]; // columns searched when ?q= provided
  defaultSort: Order;
  includes?: FindOptions["include"];
  toSearchWhere?: (q: string) => WhereOptions;
  beforeCreate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  beforeUpdate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterCreate?: (row: M, req: Request) => void | Promise<void>;
  beforeRemove?: (req: Request) => void | Promise<void>;
  /** Runs AFTER model.create() — use to create dependent rows (e.g. MessageRecipient rows for messages). */
  afterCreate?: (row: any, req: Request) => void | Promise<void>;
  detailIncludes?: FindOptions["include"];
  /** Add computed fields (e.g. related display names) to a returned row. */
  decorate?: (row: any) => Record<string, unknown>;
  /** Additional fixed filters applied to list/count queries. */
  defaultWhere?: WhereOptions;
  /** Allow-list of columns clients may filter on via filter[field]=value. */
  allowedFilters?: string[];
  /** Sensitive columns excluded from CSV exports and list responses. */
  sensitiveColumns?: string[];
  /** When true, destroy() soft-deletes via paranoid model or blocks the delete. */
  softDelete?: boolean;
}

export interface CrudHandlers {
  list: (req: Request, res: Response) => Promise<void>;
  getOne: (req: Request, res: Response) => Promise<void>;
  create: (req: Request, res: Response) => Promise<void>;
  update: (req: Request, res: Response) => Promise<void>;
  remove: (req: Request, res: Response) => Promise<void>;
  count: (req: Request, res: Response) => Promise<void>;
}

export function createCrudController<M extends Model = Model>(
  opts: CrudOptions<M>
): CrudHandlers {
  const { model, searchable, defaultSort, includes = [] } = opts;
  const detailIncludes = opts.detailIncludes ?? includes;
  const present = (row: any) => (opts.decorate ? opts.decorate(row) : row);

  const buildWhere = (req: Request): WhereOptions => {
    // Merge defaultWhere using Op.and so client filters cannot override it.
    // Previously `defaultWhere: { isActive: true }` was bypassable via `?filter[isActive]=false`.
    const where: Record<string, unknown> = {};
    if (opts.defaultWhere) (where as any)[Op.and] = [opts.defaultWhere];
    const f = req.query as Record<string, unknown>;

    // Allow-list filtering: clients may only filter on declared columns.
    // Prevents enumeration of arbitrary columns like passwordHash, role, userId, etc.
    const allowList = new Set(opts.allowedFilters ?? []);
    const nested = f["filter"];
    if (nested && typeof nested === "object") {
      for (const [field, val] of Object.entries(nested as Record<string, unknown>)) {
        if (allowList.size > 0 && !allowList.has(field)) continue;
        where[field] = val;
      }
    }
    for (const key of Object.keys(f)) {
      if (!key.startsWith("filter[")) continue;
      const field = key.slice(7, -1);
      if (allowList.size > 0 && !allowList.has(field)) continue;
      where[field] = f[key];
    }

    if (opts.toSearchWhere) {
      const q = f.q ? String(f.q) : undefined;
      const base = q ? opts.toSearchWhere(q) : undefined;
      if (base) Object.assign(where, base);
    } else if (f.q && searchable.length) {
      (where as any)[Op.or] = searchable.map((col) => ({
        [col]: { [likeOp]: `%${String(f.q)}%` },
      }));
    }

    const userBranchId = (req as any).user?.branchId;
    const attrs = (model as any).rawAttributes || {};
    if (userBranchId != null && attrs.branchId) (where as any).branchId = userBranchId;
    return where as WhereOptions;
  };

  return {
    list: async (req, res) => {
      const p = parsePagination(req);
      const where = buildWhere(req);
      const { count, rows } = await model.findAndCountAll({
        where,
        limit: p.limit,
        offset: p.offset,
        order: (p.sort.length ? p.sort : defaultSort) as Order,
        distinct: true,
        include: includes as any,
      });
      const meta: PaginationMeta = buildPaginationMeta(p.page, p.limit, count);
      ApiResponse.success(res, 200, "List fetched", rows.map(present), meta);
    },

    getOne: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const lookup: any = { id };
      const userBranchId = (req as any).user?.branchId;
      const attrs = (model as any).rawAttributes || {};
      if (userBranchId != null && attrs.branchId) lookup.branchId = userBranchId;
      const row = await model.findOne({ where: lookup, include: detailIncludes as any });
      if (!row) throw ApiError.notFound(`${model.name} not found`);
      ApiResponse.success(res, 200, "Fetched", present(row));
    },

    create: async (req, res) => {
      let body: any;
      try {
        body = opts.beforeCreate
          ? await opts.beforeCreate(req.body, req)
          : req.body;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid request");
      }
      const attrs = (model as any).rawAttributes || {};
      const userBranchId = (req as any).user?.branchId;
      if (userBranchId != null && attrs.branchId) body.branchId = userBranchId;
      // Defensive: never allow client to set id, audit, or auth fields via mass assignment.
      const FORBIDDEN_CREATE_FIELDS = new Set([
        "id", "createdAt", "updatedAt", "deletedAt",
        "passwordHash", "passwordChangedAt", "emailVerified",
      ]);
      for (const key of Object.keys(body)) {
        if (FORBIDDEN_CREATE_FIELDS.has(key)) delete body[key];
      }
      const row = await model.create(body);
      if (opts.afterCreate) await opts.afterCreate(row, req);
      ApiResponse.success(res, 201, `${model.name} created`, present(row));
    },

    update: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const attrs = (model as any).rawAttributes || {};
      const userBranchId = (req as any).user?.branchId;
      const lookup: any = { id };
      if (userBranchId != null && attrs.branchId) lookup.branchId = userBranchId;
      const row = await model.findOne({ where: lookup }) as Model | null;
      if (!row) throw ApiError.notFound(`${model.name} not found`);
      let body: any;
      try {
        body = opts.beforeUpdate
          ? await opts.beforeUpdate(req.body, req)
          : req.body;
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid request");
      }
      if (userBranchId != null && attrs.branchId) body.branchId = userBranchId;
      // Defensive: never allow client to mutate id, audit, or auth fields via mass assignment.
      const FORBIDDEN_UPDATE_FIELDS = new Set([
        "id", "createdAt", "updatedAt", "deletedAt",
        "passwordHash", "passwordChangedAt", "emailVerified",
      ]);
      for (const key of Object.keys(body)) {
        if (FORBIDDEN_UPDATE_FIELDS.has(key)) delete body[key];
      }
      await (row as any).update(body);
      ApiResponse.success(res, 200, `${model.name} updated`, present(row));
    },

    remove: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const attrs = (model as any).rawAttributes || {};
      const userBranchId = (req as any).user?.branchId;
      const lookup: any = { id };
      if (userBranchId != null && attrs.branchId) lookup.branchId = userBranchId;
      const row = await model.findOne({ where: lookup }) as Model | null;
      if (!row) throw ApiError.notFound(`${model.name} not found`);
      if (opts.beforeRemove) {
        try {
          await opts.beforeRemove(req);
        } catch (err) {
          if (err instanceof ApiError) throw err;
          throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid request");
        }
      }
      await (row as any).destroy();
      ApiResponse.success(res, 200, `${model.name} deleted`, null);
    },

    count: async (req, res) => {
      const where = buildWhere(req);
      const total = await model.count({ where });
      ApiResponse.success(res, 200, "Count", { total });
    },
  };
}