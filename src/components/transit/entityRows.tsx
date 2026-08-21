import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Stop } from './StopList';
import type { Occurrence } from './OccurrenceList';

// Both singles pass loosely-typed joined rows (see each page's `*.parts`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VenueRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ArticleRow = any;

/**
 * Venues as stops, shared by the country and city singles.
 *
 * Both pages reached the same conclusion from opposite directions: a country's
 * venues are context (never the hero), and a city's are the hero but do not
 * need a card apiece to be chosen from. Either way the row carries name,
 * category and a real anchor — a card grid spends ~150px per venue to add a
 * photograph the reader is not deciding on.
 *
 * `includeCity` is the one difference between the two callers and is
 * deliberately explicit: on a country page "bar · Berlin" locates the venue,
 * on a city page every row would end in the same city name, which is noise.
 *
 * No walking gap is claimed — venues scattered across a city are not a route
 * (that is the village single's stop list, which earns its gaps).
 */
export function venueStops(
  venues: VenueRow[],
  { limit = 6, includeCity = false }: { limit?: number; includeCity?: boolean } = {},
): Stop[] {
  return venues.slice(0, limit).map((v: VenueRow) => ({
    id: v.id,
    name: v.name,
    type: 'venue',
    href: v.slug ? `/venues/${v.slug}` : undefined,
    walkFromPrevious: null,
    accessNote: [v.category, includeCity ? v.city : null].filter(Boolean).join(' · ') || null,
  }));
}

/**
 * News as dated headline rows, shared by the country and city singles.
 *
 * `floodFirst` is off at both call sites: the ink-flooded first row means "the
 * one next instance" on an occurrence list, and the newest headline is not
 * that. See `OccurrenceList`.
 */
export function newsRows(
  articles: ArticleRow[],
  {
    locale,
    openLabel,
    limit = 5,
    onView,
  }: { locale: string; openLabel: string; limit?: number; onView?: (id: string) => void },
): Occurrence[] {
  return articles.slice(0, limit).map((a: ArticleRow) => {
    const d = a.published_at ? new Date(a.published_at) : null;
    const date =
      d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).toUpperCase()
        : '';
    return {
      id: a.id,
      date,
      detail: a.title,
      action: a.slug ? (
        <LocalizedLink
          to={`/news/${a.slug}`}
          aria-label={a.title}
          onClick={() => onView?.(a.id)}
          className="text-2xs font-bold uppercase tracking-label underline"
        >
          {openLabel}
        </LocalizedLink>
      ) : undefined,
    };
  });
}
