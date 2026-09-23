/**
 * Given a `YYYY-MM` month string, return the inclusive start and exclusive end
 * (first day of the next month) as `YYYY-MM-DD`. Works on DATEONLY columns in
 * both MySQL and PostgreSQL (string comparison, no LIKE on dates).
 */
export function monthRange(month: string): { start: string; end: string } {
  const safe = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [y, m] = safe.split("-").map((n) => parseInt(n, 10));
  const start = `${safe}-01`;
  const next = new Date(Date.UTC(y, m, 1)); // m is 1-based → next month index is m
  return { start, end: next.toISOString().slice(0, 10) };
}
