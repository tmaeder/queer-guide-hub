import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePrideCalendar } from '@/hooks/usePrideCalendar';
import { PrideTimeline } from '@/components/pride/PrideTimeline';
import { PrideMap } from '@/components/pride/PrideMap';
import { PrideEventCard } from '@/components/pride/PrideEventCard';
import {
  PrideFilterRail,
  applyPrideFilters,
  continentOf,
  type PrideFilters,
} from '@/components/pride/PrideFilterRail';
import { exportPrideIcs } from '@/utils/prideIcs';
import { Skeleton } from '@/components/ui/skeleton';

const MIN_YEAR = 2024;
const MAX_YEAR = 2028;

function parseYear(input: string | undefined): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n < MIN_YEAR || n > MAX_YEAR) return new Date().getUTCFullYear();
  return n;
}

const EMPTY_FILTERS: PrideFilters = {
  months: [],
  continents: [],
  countries: [],
  featuredOnly: false,
  query: '',
};

function filtersFromParams(params: URLSearchParams): PrideFilters {
  return {
    months: (params.get('m') ?? '').split(',').filter(Boolean).map(Number).filter((n) => n >= 0 && n < 12),
    continents: (params.get('r') ?? '').split(',').filter(Boolean),
    countries: (params.get('c') ?? '').split(',').filter(Boolean),
    featuredOnly: params.get('f') === '1',
    query: params.get('q') ?? '',
  };
}

function filtersToParams(filters: PrideFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.months.length) out.m = filters.months.join(',');
  if (filters.continents.length) out.r = filters.continents.join(',');
  if (filters.countries.length) out.c = filters.countries.join(',');
  if (filters.featuredOnly) out.f = '1';
  if (filters.query) out.q = filters.query;
  return out;
}

export default function PridePage() {
  const { year: yearParam } = useParams<{ year?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentYear = new Date().getUTCFullYear();
  const year = yearParam ? parseYear(yearParam) : currentYear;

  const [filters, setFilters] = useState<PrideFilters>(() => filtersFromParams(searchParams));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sync filter state → URL
  useEffect(() => {
    setSearchParams(filtersToParams(filters), { replace: true });
  }, [filters, setSearchParams]);

  const { data: events = [], isLoading } = usePrideCalendar({ year });

  const filtered = useMemo(() => applyPrideFilters(events, filters), [events, filters]);

  const summary = useMemo(
    () => ({
      total: filtered.length,
      countries: new Set(filtered.map((e) => e.country).filter(Boolean)).size,
      cities: new Set(filtered.map((e) => e.city).filter(Boolean)).size,
    }),
    [filtered],
  );

  const featured = useMemo(() => filtered.filter((e) => e.is_featured).slice(0, 12), [filtered]);
  const byContinent = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const c = continentOf(e.country);
      const list = groups.get(c) ?? [];
      list.push(e);
      groups.set(c, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const changeYear = (delta: number) => {
    const next = year + delta;
    if (next < MIN_YEAR || next > MAX_YEAR) return;
    navigate(`/pride/${next}${searchParams.toString() ? '?' + searchParams.toString() : ''}`);
  };

  useEffect(() => {
    document.title = `Pride Calendar ${year} · Queer Guide`;
  }, [year]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:py-12">
      {/* Hero */}
      <header className="mb-8 lg:mb-12 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs2 uppercase tracking-wider text-foreground/60">
          Pride Calendar
        </div>
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => changeYear(-1)}
              disabled={year <= MIN_YEAR}
              aria-label="Previous year"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <h1 className="text-display lg:text-hero font-medium leading-none tabular-nums">{year}</h1>
            <Button
              variant="outline"
              size="icon"
              onClick={() => changeYear(1)}
              disabled={year >= MAX_YEAR}
              aria-label="Next year"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => exportPrideIcs(filtered, year)}
            disabled={filtered.length === 0}
          >
            <Download className="size-4 mr-1.5" />
            Export .ics
          </Button>
        </div>
        <p className="text-body-lg text-foreground/70">
          {isLoading
            ? 'Loading…'
            : `${summary.total} pride${summary.total === 1 ? '' : 's'} · ${summary.countries} countries · ${summary.cities} cities`}
        </p>
      </header>

      {/* Two-col layout: filter rail + main */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-8">
        <PrideFilterRail filters={filters} setFilters={setFilters} events={events} />

        <div className="space-y-12 min-w-0">
          {/* Timeline */}
          <section aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="sr-only">
              Pride timeline
            </h2>
            {isLoading ? (
              <Skeleton className="h-40 w-full rounded-container" />
            ) : (
              <PrideTimeline
                events={filtered}
                year={year}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </section>

          {/* Map */}
          <section aria-labelledby="map-heading">
            <h2 id="map-heading" className="text-title font-medium mb-3">
              World map
            </h2>
            {isLoading ? (
              <Skeleton className="h-[480px] w-full rounded-container" />
            ) : (
              <PrideMap
                events={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </section>

          {/* Featured */}
          {featured.length > 0 && (
            <section aria-labelledby="featured-heading">
              <h2 id="featured-heading" className="text-title font-medium mb-4">
                Featured
              </h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {featured.map((e) => (
                  <PrideEventCard
                    key={e.id}
                    event={e}
                    highlighted={selectedId === e.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </section>
          )}

          {/* By region */}
          {byContinent.length > 0 && (
            <section aria-labelledby="region-heading">
              <h2 id="region-heading" className="text-title font-medium mb-4">
                By region
              </h2>
              <div className="space-y-8">
                {byContinent.map(([continent, list]) => (
                  <div key={continent}>
                    <h3 className="text-headline mb-3">{continent}</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {list.map((e) => (
                        <PrideEventCard
                          key={e.id}
                          event={e}
                          compact
                          highlighted={selectedId === e.id}
                          onSelect={setSelectedId}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="border border-foreground/15 rounded-container p-12 text-center">
              <p className="text-foreground/70">No prides match your filters.</p>
              <Button
                variant="outline"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-4"
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
