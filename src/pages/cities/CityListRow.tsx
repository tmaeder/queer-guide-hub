import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';
import { EqualityChip } from './EqualityChip';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

interface CityListRowProps {
  city: DirectoryCity;
  venueCount: number | undefined;
  selected?: boolean;
  onHover?: (cityId: string | null) => void;
}

function formatVenueCount(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1000) {
    // Math.round avoids floating-point quirks (e.g. 1450/1000 = 1.4499... → 1.4)
    const tenths = Math.round(n / 100) / 10;
    return `${tenths}k venues`;
  }
  return `${n} venues`;
}

function CityListRowImpl({ city, venueCount, selected = false, onHover }: CityListRowProps) {
  const thumb = city.image_url ?? city.curated_image_url ?? null;
  const initials = city.name.slice(0, 1).toUpperCase();
  const venueLabel = formatVenueCount(venueCount);
  const continentName = city.countries?.continents?.code ?? null;

  return (
    <li
      className={cn(
        'group relative',
        selected && 'bg-muted/40 ring-1 ring-foreground/20 rounded-element',
      )}
      data-city-id={city.id}
    >
      <LocalizedLink
        to={`/city/${city.slug || city.id}`}
        className="flex items-center gap-4 p-2 rounded-element hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 no-underline"
        onMouseEnter={() => onHover?.(city.id)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(city.id)}
        onBlur={() => onHover?.(null)}
      >
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-element bg-muted text-foreground/60"
          style={{ width: 64, height: 64 }}
        >
          {thumb ? (
            // onError hides broken images so the muted tile shows through
            // instead of the browser's broken-image icon. Load-failure
            // signal, not a user interaction.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-title font-semibold tracking-tight" aria-hidden="true">
              {initials}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-title font-semibold text-foreground m-0">{city.name}</p>
            <EqualityChip score={city.countries?.equality_score} className="shrink-0" />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-13 text-muted-foreground">
            <p className="truncate m-0">
              {city.countries?.name ?? '—'}
              {continentName ? ` · ${continentName}` : ''}
            </p>
            {venueLabel && <span className="shrink-0">{venueLabel}</span>}
          </div>
        </div>
      </LocalizedLink>
    </li>
  );
}

export const CityListRow = memo(CityListRowImpl);
