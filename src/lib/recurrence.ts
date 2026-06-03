/**
 * Canonical recurrence rule for event submissions — matches the shape consumed by the
 * `expand_event_recurrence` Postgres function (uppercase FREQ, RFC-5545 byDay codes):
 *   { freq, interval, byDay?, bySetPos?, until? }
 *
 * Supports the "every 1st Saturday" case via MONTHLY + byDay + bySetPos (ordinal weekday).
 */

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface CanonicalRecurrence {
  freq: RecurrenceFreq;
  interval: number;
  /** RFC-5545 weekday codes, e.g. ['MO','SA']. */
  byDay?: string[];
  /** 1..4 = first..fourth, -1 = last. MONTHLY + single byDay only ("1st Saturday"). */
  bySetPos?: number;
  /** ISO date the series ends on (inclusive). */
  until?: string;
}

export const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export const WEEKDAY_LABELS: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};
const WEEKDAY_FULL: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

export const ORDINAL_OPTIONS = [
  { value: 1, label: 'first' },
  { value: 2, label: 'second' },
  { value: 3, label: 'third' },
  { value: 4, label: 'fourth' },
  { value: -1, label: 'last' },
] as const;

function ordinalLabel(pos: number): string {
  return ORDINAL_OPTIONS.find((o) => o.value === pos)?.label ?? `${pos}.`;
}

/** Human-readable summary, e.g. "Monthly on the first Saturday" or "Every 2 weeks on Mon, Fri". */
export function describeRecurrence(rule: CanonicalRecurrence | null | undefined): string | null {
  if (!rule) return null;
  const until = rule.until ? ` until ${new Date(rule.until).toLocaleDateString()}` : '';

  if (rule.freq === 'DAILY') {
    return `${rule.interval > 1 ? `Every ${rule.interval} days` : 'Daily'}${until}`;
  }
  if (rule.freq === 'WEEKLY') {
    const days = (rule.byDay ?? []).map((d) => WEEKDAY_LABELS[d]).filter(Boolean).join(', ');
    const base = rule.interval === 2 ? 'Every 2 weeks' : rule.interval > 2 ? `Every ${rule.interval} weeks` : 'Weekly';
    return `${base}${days ? ` on ${days}` : ''}${until}`;
  }
  // MONTHLY
  if (rule.bySetPos && rule.byDay?.length === 1) {
    return `Monthly on the ${ordinalLabel(rule.bySetPos)} ${WEEKDAY_FULL[rule.byDay[0]]}${until}`;
  }
  return `Monthly${until}`;
}
