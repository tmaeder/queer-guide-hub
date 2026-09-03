import { format } from 'date-fns';

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
  } catch {
    return dateStr;
  }
}

/**
 * Compact population, locale-aware: "3.4B" in en, "3,4 Mrd." in de.
 *
 * Pair it with `formatPeopleExact` for anything a screen reader will speak.
 * "3.4B" is a glance format; a reader who cannot see the bar it labels needs
 * the number, and some screen readers pronounce a bare "B" as a letter.
 */
export function formatPeople(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(n);
}

/** Full digits, grouped for the locale. For aria-label and title text. */
export function formatPeopleExact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** Integer percent of a whole. A zero whole is 0, never NaN or Infinity. */
export function formatShare(part: number, whole: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
