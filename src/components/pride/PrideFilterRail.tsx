import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

export interface PrideFilters {
  months: number[];
  continents: string[];
  countries: string[];
  featuredOnly: boolean;
  verifiedOnly: boolean;
  query: string;
}

interface PrideFilterRailProps {
  filters: PrideFilters;
  setFilters: (next: PrideFilters) => void;
  events: PrideCalendarEvent[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ISO2 → continent (covers the seed)
const CONTINENT_MAP: Record<string, string> = {
  // Europe
  DE: 'Europe', GB: 'Europe', FR: 'Europe', ES: 'Europe', NL: 'Europe', SE: 'Europe',
  DK: 'Europe', NO: 'Europe', FI: 'Europe', IT: 'Europe', PT: 'Europe', AT: 'Europe',
  CH: 'Europe', BE: 'Europe', CZ: 'Europe', PL: 'Europe', HU: 'Europe', GR: 'Europe',
  IE: 'Europe', IS: 'Europe', EE: 'Europe', LV: 'Europe', LT: 'Europe', RO: 'Europe',
  BG: 'Europe', SI: 'Europe', HR: 'Europe', BA: 'Europe', RS: 'Europe', SK: 'Europe',
  GE: 'Europe', TR: 'Europe',
  // Americas
  US: 'Americas', CA: 'Americas', MX: 'Americas', BR: 'Americas', AR: 'Americas',
  CL: 'Americas', CO: 'Americas', PE: 'Americas', EC: 'Americas', UY: 'Americas',
  // Oceania
  AU: 'Oceania', NZ: 'Oceania',
  // Asia
  IL: 'Asia', JP: 'Asia', TW: 'Asia', TH: 'Asia', HK: 'Asia', KR: 'Asia',
  SG: 'Asia', PH: 'Asia', VN: 'Asia',
  // Africa
  ZA: 'Africa',
};

export function continentOf(countryCode: string | null | undefined): string {
  if (!countryCode) return 'Other';
  return CONTINENT_MAP[countryCode.toUpperCase()] ?? 'Other';
}

export function applyPrideFilters(
  events: PrideCalendarEvent[],
  filters: PrideFilters,
): PrideCalendarEvent[] {
  return events.filter((e) => {
    const d = new Date(e.start_date);
    const month = d.getUTCMonth();
    if (filters.months.length && !filters.months.includes(month)) return false;
    if (filters.continents.length && !filters.continents.includes(continentOf(e.country))) return false;
    if (filters.countries.length && !filters.countries.includes(e.country ?? '')) return false;
    if (filters.featuredOnly && !e.is_featured) return false;
    if (filters.verifiedOnly && e.verification_status !== 'verified') return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      if (
        !e.title.toLowerCase().includes(q) &&
        !(e.city ?? '').toLowerCase().includes(q) &&
        !(e.country ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
}

export function PrideFilterRail({ filters, setFilters, events }: PrideFilterRailProps) {
  const continents = useMemo(() => {
    const c = new Set<string>();
    for (const e of events) c.add(continentOf(e.country));
    return Array.from(c).sort();
  }, [events]);

  const countriesByContinent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of events) {
      const cont = continentOf(e.country);
      const set = map.get(cont) ?? new Set<string>();
      if (e.country) set.add(e.country);
      map.set(cont, set);
    }
    return map;
  }, [events]);

  const toggleMonth = (m: number) =>
    setFilters({
      ...filters,
      months: filters.months.includes(m)
        ? filters.months.filter((x) => x !== m)
        : [...filters.months, m],
    });
  const toggleContinent = (c: string) =>
    setFilters({
      ...filters,
      continents: filters.continents.includes(c)
        ? filters.continents.filter((x) => x !== c)
        : [...filters.continents, c],
    });
  const toggleCountry = (c: string) =>
    setFilters({
      ...filters,
      countries: filters.countries.includes(c)
        ? filters.countries.filter((x) => x !== c)
        : [...filters.countries, c],
    });

  const hasActive =
    filters.months.length > 0 ||
    filters.continents.length > 0 ||
    filters.countries.length > 0 ||
    filters.featuredOnly ||
    filters.verifiedOnly ||
    filters.query.length > 0;

  return (
    <aside className="space-y-6 text-sm" aria-label="Pride filters">
      <div>
        <label htmlFor="pride-search" className="block mb-2 text-xs2 font-medium uppercase tracking-wide text-foreground/60">
          Search
        </label>
        <input
          id="pride-search"
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder="City, country, name…"
          className="w-full rounded-element border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs2 font-medium uppercase tracking-wide text-foreground/60">Month</h3>
        <div className="grid grid-cols-4 gap-2">
          {MONTHS.map((m, i) => {
            const on = filters.months.includes(i);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMonth(i)}
                className={cn(
                  'px-2 py-1 text-xs rounded-badge border transition-colors',
                  on
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-foreground/20 hover:bg-muted',
                )}
                aria-pressed={on}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs2 font-medium uppercase tracking-wide text-foreground/60">Region</h3>
        <div className="flex flex-wrap gap-2">
          {continents.map((c) => {
            const on = filters.continents.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleContinent(c)}
                className={cn(
                  'px-2 py-1 text-xs rounded-badge border transition-colors',
                  on ? 'bg-foreground text-background border-foreground' : 'border-foreground/20 hover:bg-muted',
                )}
                aria-pressed={on}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {filters.continents.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs2 font-medium uppercase tracking-wide text-foreground/60">Country</h3>
          <div className="flex flex-wrap gap-1.5">
            {filters.continents.flatMap((cont) =>
              Array.from(countriesByContinent.get(cont) ?? []).sort().map((cc) => {
                const on = filters.countries.includes(cc);
                return (
                  <button
                    key={cc}
                    type="button"
                    onClick={() => toggleCountry(cc)}
                    className={cn(
                      'px-1.5 py-0.5 text-2xs rounded-badge border transition-colors',
                      on ? 'bg-foreground text-background border-foreground' : 'border-foreground/20 hover:bg-muted',
                    )}
                    aria-pressed={on}
                  >
                    {cc}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.featuredOnly}
            onChange={(e) => setFilters({ ...filters, featuredOnly: e.target.checked })}
            className="accent-foreground"
          />
          Featured only
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
            className="accent-foreground"
          />
          Confirmed dates only
        </label>
      </div>

      {hasActive && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setFilters({ months: [], continents: [], countries: [], featuredOnly: false, verifiedOnly: false, query: '' })
          }
          className="w-full"
        >
          <X className="size-3.5 mr-1" />
          Clear all
        </Button>
      )}
    </aside>
  );
}
