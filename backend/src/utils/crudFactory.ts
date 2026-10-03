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
  afterUpdate?: (row: M, req: Request) => void | Promise<void>;
  /** Runs after the row is deleted (row is the deleted instance). */
  afterRemove?: (row: M, req: Request) => void | Promise<void>;
  beforeRemove?: (req: Request) => void | Promise<void>;
  detailIncludes?: FindOptions["include"];
  /** Add computed fields (e.g. related display names) to a returned row. */
  decorate?: (row: any) => Record<string, unknown>;
  /** Additional fixed filters applied to list/count queries. */
  defaultWhere?: WhereOptions;
  /** Row-level access rule (e.g. parents only see their own children). May be async. */
  scopeWhere?: (req: Request) => WhereOptions | Promise<WhereOptions>;
  /** Columns to hide from the response for this request (e.g. medicalInfo for non-staff). */
  hideAttributes?: (req: Request) => string[];
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
  /** Same filters/scope/search as list(); reused by CSV export so exports can't bypass access rules. */
  buildWhere: (req: Request) => Promise<WhereOptions>;
  /** Attributes that must never be exposed for this resource. */
  hiddenColumns: (req: Request) => string[];
}

export function createCrudController<M extends Model = Model>(
  opts: CrudOptions<M>
): CrudHandlers {
  const { model, searchable, defaultSort, includes = [] } = opts;
  const detailIncludes = opts.detailIncludes ?? includes;
  const present = (row: any) => (opts.decorate ? opts.decorate(row) : row);

  const modelAttrs = (): Record<string, unknown> => (model as any).rawAttributes || {};
  const NEVER_EXPOSE = new Set(["passwordHash", "tokenHash", "token"]);
  const hiddenColumns = (req: Request): string[] => [
    ...NEVER_EXPOSE, ...(opts.sensitiveColumns ?? []), ...(opts.hideAttributes ? opts.hideAttributes(req) : []),
  ].filter((c) => c in modelAttrs());
  const attributesFor = (req: Request) => {
    const hidden = hiddenColumns(req);
    return hidden.length ? { exclude: hidden } : undefined;
  };
  // Only real, non-sensitive columns may be filtered/sorted on.
  const filterable = (): Set<string> => {
    const base = opts.allowedFilters ?? Object.keys(modelAttrs());
    return new Set(base.filter((c) => !NEVER_EXPOSE.has(c) && !(opts.sensitiveColumns ?? []).includes(c)));
  };
  const isPrimitive = (v: unknown) => ["string", "number", "boolean"].includes(typeof v);
  const cleanFilterValue = (v: unknown): unknown => {
    if (isPrimitive(v)) return v;
    if (Array.isArray(v) && v.length <= 100 && v.every(isPrimitive)) return v;
    return undefined; // objects would let clients smuggle query operators
  };
  const safeOrder = (sort: Array<[string, "ASC" | "DESC"]>): Order | null => {
    const attrs = modelAttrs();
    const ok = sort.filter(([k]) => k in attrs && !NEVER_EXPOSE.has(k) && !(opts.sensitiveColumns ?? []).includes(k));
    return ok.length ? (ok as Order) : null;
  };
  const scopeOf = async (req: Request): Promise<WhereOptions | null> =>
    opts.scopeWhere ? await opts.scopeWhere(req) : null;
  /** id lookup that ANDs the id with the scope (never lets the scope overwrite the id). */
  const lookupById = async (req: Request, id: number) => {
    const attrs = modelAttrs();
    const userBranchId = (req as any).user?.branchId;
    const and: WhereOptions[] = [{ id } as any];
    const scope = await scopeOf(req);
    if (scope) and.push(scope);
    if (userBranchId != null && attrs.branchId) and.push({ branchId: userBranchId } as any);
    return { [Op.and]: and } as WhereOptions;
  };

  const buildWhere = async (req: Request): Promise<WhereOptions> => {
    // Merge defaultWhere using Op.and so client filters cannot override it.
    const and: WhereOptions[] = [];
    if (opts.defaultWhere) and.push(opts.defaultWhere);
    const scope = await scopeOf(req);
    if (scope) and.push(scope);
    const where: Record<string, unknown> = {};
    const f = req.query as Record<string, unknown>;

    const allow = filterable();
    const nested = f["filter"];
    const apply = (field: string, val: unknown) => {
      if (!allow.has(field)) return;
      const clean = cleanFilterValue(val);
      if (clean !== undefined) where[field] = clean;
    };
    if (nested && typeof nested === "object") {
      for (const [field, val] of Object.entries(nested as Record<string, unknown>)) apply(field, val);
    }
    for (const key of Object.keys(f)) {
      if (!key.startsWith("filter[")) continue;
      apply(key.slice(7, -1), f[key]);
    }

    if (opts.toSearchWhere) {
      const q = f.q ? String(f.q) : undefined;
      const base = q ? opts.toSearchWhere(q) : undefined;
      if (base) and.push(base);
    } else if (f.q && searchable.length) {
      and.push({
        [Op.or]: searchable.map((col) => ({ [col]: { [likeOp]: `%${String(f.q)}%` } })),
      } as any);
    }

    // ?ids=1,2,3 -> bulk lookup by primary key (lets the UI show names instead of raw ids).
    if (typeof f.ids === "string" && /^\d+(,\d+){0,199}$/.test(f.ids)) where.id = f.ids.split(",").map(Number);

    const userBranchId = (req as any).user?.branchId;
    if (userBranchId != null && modelAttrs().branchId) where.branchId = userBranchId;
    if (and.length) (where as any)[Op.and] = and;
    return where as WhereOptions;
  };

  return {
    list: async (req, res) => {
      const p = parsePagination(req);
      const where = await buildWhere(req);
      const { count, rows } = await model.findAndCountAll({
        where,
        limit: p.limit,
        offset: p.offset,
        order: (safeOrder(p.sort) ?? defaultSort) as Order,
        distinct: true,
        include: includes as any,
        attributes: attributesFor(req),
      });
      const meta: PaginationMeta = buildPaginationMeta(p.page, p.limit, count);
      ApiResponse.success(res, 200, "List fetched", rows.map(present), meta);
    },

    getOne: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const row = await model.findOne({
        where: await lookupById(req, id), include: detailIncludes as any, attributes: attributesFor(req),
      });
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
      const row = await model.findOne({ where: await lookupById(req, id) }) as Model | null;
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
      if (opts.afterUpdate) await opts.afterUpdate(row as M, req);
      ApiResponse.success(res, 200, `${model.name} updated`, present(row));
    },

    remove: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const row = await model.findOne({ where: await lookupById(req, id) }) as Model | null;
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
      if (opts.afterRemove) await opts.afterRemove(row as M, req);
      ApiResponse.success(res, 200, `${model.name} deleted`, null);
    },

    count: async (req, res) => {
      const where = await buildWhere(req);
      const total = await model.count({ where });
      ApiResponse.success(res, 200, "Count", { total });
    },
    buildWhere,
    hiddenColumns,
  };
}