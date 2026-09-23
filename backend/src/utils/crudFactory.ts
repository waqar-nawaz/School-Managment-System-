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
  detailIncludes?: FindOptions["include"];
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

  const buildWhere = (req: Request): WhereOptions => {
    const where: Record<string, unknown> = {};
    const f = req.query as Record<string, unknown>;

    // Support both flat (filter[field]=x with the simple parser) and nested
    // (filter: { field: x } with Express's default extended parser).
    const nested = f["filter"];
    if (nested && typeof nested === "object") {
      for (const [field, val] of Object.entries(nested as Record<string, unknown>)) {
        where[field] = val;
      }
    }
    for (const key of Object.keys(f)) {
      if (!key.startsWith("filter[")) continue;
      const field = key.slice(7, -1);
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
      ApiResponse.success(res, 200, "List fetched", rows, meta);
    },

    getOne: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const row = await model.findByPk(id, { include: detailIncludes as any });
      if (!row) throw ApiError.notFound(`${model.name} not found`);
      ApiResponse.success(res, 200, "Fetched", row);
    },

    create: async (req, res) => {
      const body = opts.beforeCreate
        ? await opts.beforeCreate(req.body, req)
        : req.body;
      const row = await model.create(body);
      ApiResponse.success(res, 201, `${model.name} created`, row);
    },

    update: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const row = await model.findByPk(id) as Model | null;
      if (!row) throw ApiError.notFound(`${model.name} not found`);
      const body = opts.beforeUpdate
        ? await opts.beforeUpdate(req.body, req)
        : req.body;
      await (row as any).update(body);
      ApiResponse.success(res, 200, `${model.name} updated`, row);
    },

    remove: async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
      const row = await model.findByPk(id) as Model | null;
      if (!row) throw ApiError.notFound(`${model.name} not found`);
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