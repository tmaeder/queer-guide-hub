/**
 * Pure helpers for surfacing "next pride" per city in the /cities directory.
 *
 * Given a stream of pride events (from usePrideCalendar) build a
 * Map<city_id, { date, title }> containing the *next* upcoming pride
 * within `windowDays` for each city — used by CityListRow to render a
 * compact "Pride · Jul 26" pill.
 */

export interface PrideEventLike {
  start_date: string;
  city_id: string | null;
  title?: string | null;
}

export interface NextPride {
  date: Date;
  title: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildPrideByCity(
  events: readonly PrideEventLike[],
  now: Date = new Date(),
  windowDays = 90,
): Map<string, NextPride> {
  const windowEnd = new Date(now.getTime() + windowDays * DAY_MS);
  const out = new Map<string, NextPride>();
  for (const e of events) {
    if (!e.city_id) continue;
    const d = new Date(e.start_date);
    if (Number.isNaN(d.getTime())) continue;
    if (d < now || d > windowEnd) continue;
    const existing = out.get(e.city_id);
    if (!existing || d < existing.date) {
      out.set(e.city_id, { date: d, title: e.title ?? 'Pride' });
    }
  }
  return out;
}

const ENGLISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const prideFormatters = new Map<string, Intl.DateTimeFormat>();

/** Short month/day label; reuse locale data across every visible city card. */
export function formatPrideDate(date: Date, locale = 'en-US'): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid time value');
  // This is exactly Intl's en-US short month/day output, in the same local
  // timezone. Avoid initializing ICU in the first city-card render.
  if (locale === 'en-US' || locale === 'en')
    return `${ENGLISH_MONTHS[date.getMonth()]} ${date.getDate()}`;
  let formatter = prideFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    if (prideFormatters.size >= 16) prideFormatters.clear();
    prideFormatters.set(locale, formatter);
  }
  return formatter.format(date);
}
