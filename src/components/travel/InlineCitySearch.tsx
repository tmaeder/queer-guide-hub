import { useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Search, Star } from '@/components/icons';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/input';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useSearch } from '@/hooks/useSearch';
import { hrefForSearchResult } from '@/lib/searchRoutes';

export type CitySearchKind = 'venue' | 'event';

/**
 * Search venues or events in one city without leaving the trip package. The
 * parent owns the venue/event switch (it sits beside tours in the trip finder).
 */
export function InlineCitySearch({
  city,
  kind,
  start,
  end,
}: {
  city: string;
  kind: CitySearchKind;
  /** Trip dates (yyyy-MM-dd). Events are limited to this window. */
  start?: string;
  end?: string;
}) {
  const [query, setQuery] = useState('');
  const dateRange: [Date, Date] | undefined =
    kind === 'event' && start
      ? [new Date(`${start}T00:00:00`), new Date(`${end || start}T23:59:59`)]
      : undefined;
  const { results, loading } = useSearch(query, { types: [kind], location: city, dateRange });
  const top = results.slice(0, 6);
  const seeAllParams = new URLSearchParams({ city });
  if (query.trim()) seeAllParams.set(kind === 'event' ? 'q' : 'search', query.trim());
  if (kind === 'event' && start) {
    seeAllParams.set('from', start);
    seeAllParams.set('to', end || start);
  }
  const seeAll = `/${kind === 'venue' ? 'venues' : 'events'}?${seeAllParams.toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${kind === 'venue' ? 'venues' : 'events'} in ${city}`}
          placeholder={
            kind === 'venue'
              ? `Bars, saunas, cafés in ${city}…`
              : `Parties, Pride, shows in ${city}…`
          }
          className="ps-10"
        />
      </div>

      <ul
        className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3 max-sm:[&>li:nth-child(n+5)]:hidden"
        aria-busy={loading}
      >
        {loading && top.length === 0
          ? [1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i} className="h-20 animate-pulse rounded-element bg-muted" />
            ))
          : top.map((r) => (
              <li key={r.objectID}>
                <LocalizedLink
                  to={hrefForSearchResult(r, r.title)}
                  className="card-lift group flex h-full items-center gap-2 rounded-element bg-card p-2 no-underline shadow-soft sm:gap-4"
                >
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-element bg-muted sm:size-16">
                    {r.imageUrl ? (
                      <Image
                        src={r.imageUrl}
                        alt=""
                        aspect="square"
                        rounded="none"
                        sizes="64px"
                        fallbackArtwork={<FallbackIcon kind={kind} />}
                      />
                    ) : (
                      <FallbackIcon kind={kind} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-15 font-bold leading-tight group-hover:underline">
                      {r.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {r.category && (
                        <span className="rounded-badge bg-muted px-1.5 py-0.5 font-bold capitalize text-foreground">
                          {r.category.replace(/_/g, ' ')}
                        </span>
                      )}
                      {r.date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} aria-hidden />
                          {new Date(r.date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                      {typeof r.rating === 'number' && r.rating > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star size={12} aria-hidden />
                          {r.rating.toFixed(1)}
                        </span>
                      )}
                    </span>
                    {(r.description || r.tags?.length) && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {r.description || r.tags!.slice(0, 3).join(' · ')}
                      </span>
                    )}
                  </span>
                  <ArrowRight size={14} aria-hidden className="shrink-0 rtl:rotate-180" />
                </LocalizedLink>
              </li>
            ))}
        {!loading && top.length === 0 && (
          <li className="px-1 text-13 text-muted-foreground sm:col-span-2 lg:col-span-3">
            Nothing matches that yet.
          </li>
        )}
      </ul>

      <LocalizedLink
        to={seeAll}
        className="inline-flex w-fit items-center gap-1.5 text-13 font-bold no-underline hover:underline"
      >
        See all {kind === 'venue' ? 'venues' : 'events'} in {city}
        <ArrowRight size={14} aria-hidden className="rtl:rotate-180" />
      </LocalizedLink>
    </div>
  );
}

function FallbackIcon({ kind }: { kind: CitySearchKind }) {
  return kind === 'venue' ? (
    <MapPin size={20} aria-hidden />
  ) : (
    <CalendarDays size={20} aria-hidden />
  );
}
