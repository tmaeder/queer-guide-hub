import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { X, Search } from 'lucide-react';
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

const CONTINENT_MAP: Record<string, string> = {
  DE: 'Europe', GB: 'Europe', FR: 'Europe', ES: 'Europe', NL: 'Europe', SE: 'Europe',
  DK: 'Europe', NO: 'Europe', FI: 'Europe', IT: 'Europe', PT: 'Europe', AT: 'Europe',
  CH: 'Europe', BE: 'Europe', CZ: 'Europe', PL: 'Europe', HU: 'Europe', GR: 'Europe',
  IE: 'Europe', IS: 'Europe', EE: 'Europe', LV: 'Europe', LT: 'Europe', RO: 'Europe',
  BG: 'Europe', SI: 'Europe', HR: 'Europe', BA: 'Europe', RS: 'Europe', SK: 'Europe',
  GE: 'Europe', TR: 'Europe',
  US: 'Americas', CA: 'Americas', MX: 'Americas', BR: 'Americas', AR: 'Americas',
  CL: 'Americas', CO: 'Americas', PE: 'Americas', EC: 'Americas', UY: 'Americas',
  AU: 'Oceania', NZ: 'Oceania',
  IL: 'Asia', JP: 'Asia', TW: 'Asia', TH: 'Asia', HK: 'Asia', KR: 'Asia',
  SG: 'Asia', PH: 'Asia', VN: 'Asia',
  ZA: 'Africa',
};

// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
export function continentOf(countryCode: string | null | undefined): string {
  if (!countryCode) return 'Other';
  return CONTINENT_MAP[countryCode.toUpperCase()] ?? 'Other';
}

// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
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
  const { t } = useTranslation();
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
      months: filters.months.includes(m) ? filters.months.filter((x) => x !== m) : [...filters.months, m],
    });
  const toggleContinent = (c: string) =>
    setFilters({
      ...filters,
      continents: filters.continents.includes(c) ? filters.continents.filter((x) => x !== c) : [...filters.continents, c],
    });
  const toggleCountry = (c: string) =>
    setFilters({
      ...filters,
      countries: filters.countries.includes(c) ? filters.countries.filter((x) => x !== c) : [...filters.countries, c],
    });

  const hasActive =
    filters.months.length > 0 ||
    filters.continents.length > 0 ||
    filters.countries.length > 0 ||
    filters.featuredOnly ||
    filters.verifiedOnly ||
    filters.query.length > 0;

  const chip = (active: boolean) =>
    cn(
      'px-2 py-1 text-xs rounded-badge border transition-colors min-h-0',
      active ? 'bg-foreground text-background border-foreground' : 'border-foreground/20 hover:bg-muted',
    );

  return (
    <div
      className="rounded-container border border-foreground/15 bg-background p-4 lg:p-6 space-y-4"
      aria-label={t('pride.filters.aria')}
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            id="pride-search"
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder={t('pride.filters.searchPlaceholder')}
            aria-label={t('pride.filters.searchAria')}
            className="w-full rounded-element border border-foreground/20 bg-background pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.featuredOnly}
            onChange={(e) => setFilters({ ...filters, featuredOnly: e.target.checked })}
            className="accent-foreground"
          />
          {t('pride.filters.featured')}
        </label>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.verifiedOnly}
            onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
            className="accent-foreground"
          />
          {t('pride.filters.verified')}
        </label>

        {hasActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters({ months: [], continents: [], countries: [], featuredOnly: false, verifiedOnly: false, query: '' })
            }
            className="ml-auto min-h-0"
          >
            <X className="size-3.5 mr-1" />
            {t('pride.filters.clearAll')}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs2 font-medium uppercase tracking-wide text-foreground/60 mr-1">{t('pride.filters.month')}</span>
        {MONTHS.map((m, i) => {
          const on = filters.months.includes(i);
          return (
            <button key={m} type="button" onClick={() => toggleMonth(i)} aria-pressed={on} className={chip(on)}>
              {m}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs2 font-medium uppercase tracking-wide text-foreground/60 mr-1">{t('pride.filters.region')}</span>
        {continents.map((c) => {
          const on = filters.continents.includes(c);
          return (
            <button key={c} type="button" onClick={() => toggleContinent(c)} aria-pressed={on} className={chip(on)}>
              {t(`pride.continents.${c}` as 'pride.continents.Europe')}
            </button>
          );
        })}
      </div>

      {filters.continents.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs2 font-medium uppercase tracking-wide text-foreground/60 mr-1">{t('pride.filters.country')}</span>
          {filters.continents.flatMap((cont) =>
            Array.from(countriesByContinent.get(cont) ?? []).sort().map((cc) => {
              const on = filters.countries.includes(cc);
              return (
                <button
                  key={cc}
                  type="button"
                  onClick={() => toggleCountry(cc)}
                  aria-pressed={on}
                  className={cn(
                    'px-1.5 py-0.5 text-2xs rounded-badge border transition-colors min-h-0',
                    on ? 'bg-foreground text-background border-foreground' : 'border-foreground/20 hover:bg-muted',
                  )}
                >
                  {cc}
                </button>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}
