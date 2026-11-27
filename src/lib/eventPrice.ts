import { formatCurrency } from '@/lib/currency';

interface PricedEvent {
  is_free?: boolean | null;
  price_min?: number | null;
  price_max?: number | null;
  currency?: string | null;
}

/** "Free", "€10", "€10 – €20", "From €10", or null when no price is known. */
export function formatEventPrice(event: PricedEvent | null | undefined): string | null {
  if (!event) return null;
  if (event.is_free) return 'Free';
  const { price_min: min, price_max: max, currency } = event;
  if (min && max) {
    if (min === max) return formatCurrency(min, currency);
    return `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
  }
  if (min) return `From ${formatCurrency(min, currency)}`;
  return null;
}
