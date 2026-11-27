import { differenceInCalendarDays, format, type Locale } from 'date-fns';

/**
 * Pure helpers shared by /festivals and /festivals/:slug. Kept out of the
 * pages so both render dates, lengths and places the same way, and so they
 * can be tested without a router.
 */

export interface DatedEdition {
  start_date: string;
  end_date: string | null;
}

// Local calendar day, matching how the span itself is formatted.
const day = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/** "15–17 Jan", "28 Jan – 2 Feb", "15 Jan" — the year only when asked for. */
export function festivalDateSpan(e: DatedEdition, locale?: Locale, withYear = false): string {
  const s = new Date(e.start_date);
  const end = new Date(e.end_date ?? e.start_date);
  const y = withYear ? ' yyyy' : '';
  const opts = locale ? { locale } : undefined;
  if (day(e.start_date) === day(e.end_date ?? e.start_date)) return format(s, `d MMM${y}`, opts);
  if (format(s, 'yyyy-MM') === format(end, 'yyyy-MM')) {
    return `${format(s, 'd', opts)}–${format(end, `d MMM${y}`, opts)}`;
  }
  // Crossing a year boundary always names both years, or "28 Dec – 2 Jan"
  // reads as going backwards.
  if (format(s, 'yyyy') !== format(end, 'yyyy')) {
    return `${format(s, 'd MMM yyyy', opts)} – ${format(end, 'd MMM yyyy', opts)}`;
  }
  return `${format(s, 'd MMM', opts)} – ${format(end, `d MMM${y}`, opts)}`;
}

/** Calendar days the edition spans, inclusive. A one-day event is 1. */
export function festivalLengthDays(e: DatedEdition): number {
  return (
    Math.max(
      0,
      differenceInCalendarDays(new Date(e.end_date ?? e.start_date), new Date(e.start_date)),
    ) + 1
  );
}

export type FestivalTiming =
  | { kind: 'now'; endsInDays: number }
  | { kind: 'soon'; inDays: number }
  | { kind: 'later' }
  | { kind: 'past' };

/** Where an edition sits relative to `now`. "soon" is the next 60 days. */
export function festivalTiming(e: DatedEdition, now = new Date()): FestivalTiming {
  const start = new Date(e.start_date);
  const end = new Date(e.end_date ?? e.start_date);
  const endsInDays = differenceInCalendarDays(end, now);
  if (endsInDays < 0) return { kind: 'past' };
  const inDays = differenceInCalendarDays(start, now);
  if (inDays <= 0) return { kind: 'now', endsInDays };
  if (inDays <= 60) return { kind: 'soon', inDays };
  return { kind: 'later' };
}

const regionNames = new Map<string, Intl.DisplayNames | null>();

/**
 * `festivals.country` mostly holds ISO-3166 alpha-2 codes ("DE"). Readers
 * should see "Germany", in their own language. Anything that is not a code
 * is shown as stored.
 */
export function countryName(value: string | null | undefined, language = 'en'): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^[A-Za-z]{2}$/.test(v)) return v;
  let names = regionNames.get(language);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([language, 'en'], { type: 'region' });
    } catch {
      names = null;
    }
    regionNames.set(language, names);
  }
  try {
    return names?.of(v.toUpperCase()) ?? v;
  } catch {
    return v;
  }
}

export function festivalPlace(
  f: { city: string | null; country: string | null },
  language = 'en',
): string {
  return [f.city, countryName(f.country, language)].filter(Boolean).join(', ');
}

/** The brand filters on /festivals. Anything else counts as "other". */
export const FESTIVAL_TYPES = [
  'pride',
  'festival',
  'fetish',
  'bear',
  'circuit',
  'film',
  'sports',
  'other',
] as const;
export type FestivalTypeKey = (typeof FESTIVAL_TYPES)[number];

export function festivalTypeKey(type: string | null | undefined): FestivalTypeKey {
  return (FESTIVAL_TYPES as readonly string[]).includes(type ?? '')
    ? (type as FestivalTypeKey)
    : 'other';
}
