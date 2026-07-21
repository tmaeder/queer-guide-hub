// Precision-aware date formatting for milestones. `date` is always a full
// YYYY-MM-DD (year precision stores Jan 1); `precision` says how much is real.

import type { MilestoneDatePrecision } from '@/types/milestone';

function formatOne(iso: string, precision: MilestoneDatePrecision, locale: string): string {
  const year = iso.slice(0, 4);
  if (precision === 'year') return year;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return year;
  if (precision === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function formatMilestoneDate(
  date: string,
  precision: MilestoneDatePrecision,
  locale: string,
  dateEnd?: string | null,
  dateEndPrecision?: MilestoneDatePrecision | null,
): string {
  const start = formatOne(date, precision, locale);
  if (!dateEnd) return start;
  const end = formatOne(dateEnd, dateEndPrecision ?? precision, locale);
  if (end === start) return start;
  // Year-only ranges collapse to "1933–1945"; mixed precisions just join.
  return `${start}–${end}`;
}

export function milestoneYear(date: string): number {
  return Number(date.slice(0, 4));
}

export function milestoneDecade(date: string): number {
  return Math.floor(milestoneYear(date) / 10) * 10;
}
