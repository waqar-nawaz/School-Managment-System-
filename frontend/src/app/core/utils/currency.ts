import { environment } from '../../../environments/environment';

const KEY = 'sms_currency';

/** ISO 4217 code used everywhere money is shown (school setting > environment default). */
export function currencyCode(): string {
  const saved = localStorage.getItem(KEY);
  return saved && /^[A-Z]{3}$/.test(saved) ? saved : environment.currency;
}

export function setCurrencyCode(code: string | null | undefined): void {
  const c = String(code ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) localStorage.setItem(KEY, c);
}

export function formatMoney(value: unknown): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode() }).format(Number(value ?? 0));
  } catch {
    return `${currencyCode()} ${Number(value ?? 0).toFixed(2)}`;
  }
}
