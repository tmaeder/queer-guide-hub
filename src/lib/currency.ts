/**
 * Centralized currency formatting using Intl.NumberFormat.
 * Replaces all hardcoded $ formatting across the codebase.
 */

// Stripe zero-decimal currencies — amount IS the charge (no division by 100)
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, fractionDigits?: number): Intl.NumberFormat {
  const key = `${currency}:${fractionDigits ?? 'auto'}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    const opts: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currency.toUpperCase(),
    };
    if (fractionDigits !== undefined) {
      opts.minimumFractionDigits = fractionDigits;
      opts.maximumFractionDigits = fractionDigits;
    }
    fmt = new Intl.NumberFormat(navigator?.language || 'en-US', opts);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/** Format a whole-unit amount (e.g. 25.50 EUR) */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return getFormatter(currency.toUpperCase(), 0).format(amount);
}

/** Format a Stripe cents amount (e.g. 2550 → $25.50, or 500 JPY → ¥500) */
export function formatCents(cents: number, currency = 'USD'): string {
  const upper = currency.toUpperCase();
  const amount = ZERO_DECIMAL_CURRENCIES.has(upper) ? cents : cents / 100;
  return getFormatter(upper, 0).format(amount);
}

/** Get just the symbol for a currency (e.g. '$', '€', '¥') */
export function getCurrencySymbol(currency: string): string {
  const upper = currency.toUpperCase();
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: upper,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || upper;
  } catch {
    return upper;
  }
}

/** Whether a currency uses zero-decimal amounts in Stripe */
export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
}
