import { Request } from "express";

export interface Pagination {
  page: number;
  limit: number;
  offset: number;
  sort: Array<[string, "ASC" | "DESC"]>;
  search?: string;
}

const SORTABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

function toInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function parsePagination(req: Request, defaultLimit = 10): Pagination {
  const page = Math.max(1, toInt(req.query.page ?? "1", 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit ?? String(defaultLimit), defaultLimit)));
  const sortRaw = String(req.query.sort || "-createdAt");

  const sort: Array<[string, "ASC" | "DESC"]> = sortRaw
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((field) => {
      const desc = field.startsWith("-");
      const key = desc ? field.slice(1) : field;
      if (!SORTABLE_PATTERN.test(key)) return null;
      return [key, desc ? "DESC" : "ASC"] as [string, "ASC" | "DESC"];
    })
    .filter((x): x is [string, "ASC" | "DESC"] => Boolean(x));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    sort,
    search: req.query.q ? String(req.query.q) : undefined,
  };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): { page: number; limit: number; total: number; totalPages: number } {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}