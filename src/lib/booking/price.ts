/**
 * Shared price formatting helpers for booking results.
 *
 * Use these everywhere a provider price is rendered. Never hand-concatenate
 * a currency glyph — invalid prices (0, null, NaN, negative) would otherwise
 * render as "€ 0" and mislead users.
 */

export function hasValidPrice(price: number | null | undefined): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

export interface FormatPriceOptions {
  locale?: string;
  unavailableLabel?: string;
}

export function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
  options?: FormatPriceOptions,
): string {
  const unavailable = options?.unavailableLabel ?? 'Price on request';
  if (!hasValidPrice(price)) return unavailable;
  const code = (currency || 'EUR').toUpperCase();
  const locale =
    options?.locale ??
    (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${code} ${Math.round(price)}`;
  }
}
