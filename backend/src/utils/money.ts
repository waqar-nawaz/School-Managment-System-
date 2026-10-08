import { ApiError } from "./ApiError";

/** Money is stored with 2 decimals. Round after every calculation so 10.10 + 20.20 is exactly 30.30. */
export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Parse an amount typed by a person: a finite number with at most 2 decimals, within sane bounds.
 * (Silently rounding 10.005 would make the receipt and the books disagree, so it is rejected.)
 */
export function parseMoney(value: unknown, label: string, opts: { min?: number; max?: number; allowZero?: boolean } = {}): number {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) throw ApiError.badRequest(`${label} must be a number`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw ApiError.badRequest(`${label} can have at most 2 decimal places`);
  const min = opts.min ?? 0;
  if (n < min || (n === 0 && !opts.allowZero)) throw ApiError.badRequest(`${label} must be greater than 0`);
  if (n > (opts.max ?? 1_000_000_000)) throw ApiError.badRequest(`${label} is too large`);
  return round2(n);
}

export const PAYMENT_METHODS = ["cash", "card", "bank", "mobile", "online", "bank_transfer", "cheque"] as const;
export const isCash = (method: string): boolean => method === "cash";

export function parseCurrency(value: unknown, fallback = "PKR"): string {
  if (value === undefined || value === null || value === "") return fallback;
  const c = String(value).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw ApiError.badRequest("Currency must be a 3-letter code such as PKR or USD");
  return c;
}
