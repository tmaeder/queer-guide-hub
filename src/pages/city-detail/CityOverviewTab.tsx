import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import type { CityRelation } from './types';

export interface CityOverviewTabProps {
  city: CityRelation;
}

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-b-0">
      <dt className="text-13 text-muted-foreground">{label}</dt>
      <dd className="text-right text-15 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ChipCluster({ heading, items }: { heading: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-4 text-title font-semibold tracking-tight">{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <Badge key={`${item}-${i}`} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DefinitionGrid({
  heading,
  entries,
}: {
  heading: string;
  entries: [string, unknown][];
}) {
  if (!entries.length) return null;
  return (
    <div>
      <h3 className="mb-4 text-title font-semibold tracking-tight">{heading}</h3>
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2"
          >
            <dt className="text-13 capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
            <dd className="text-right text-15 font-medium">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The encyclopedic "About" section — every city field the headline strip doesn't
 * already surface. A flat two-column reading layout (lead essay + facts aside),
 * not the old card-in-card soup. No fact repeats what At-a-glance already shows.
 */
export function CityOverviewTab({ city }: CityOverviewTabProps) {
  const facts: { label: string; value: ReactNode }[] = [];
  const civicStatus = city.is_capital
    ? 'Capital city'
    : city.is_major_city
      ? 'Major city'
      : null;
  if (civicStatus) facts.push({ label: 'Status', value: civicStatus });
  if (city.region_name) facts.push({ label: 'Region', value: city.region_name });
  if (city.timezone) facts.push({ label: 'Timezone', value: city.timezone });
  if (city.founded_year) facts.push({ label: 'Founded', value: String(city.founded_year) });
  if (city.area_km2) facts.push({ label: 'Area', value: `${city.area_km2} km²` });
  if (city.elevation_m) facts.push({ label: 'Elevation', value: `${city.elevation_m} m` });
  if (city.climate_type) facts.push({ label: 'Climate', value: city.climate_type });
  if (city.mayor) facts.push({ label: 'Mayor', value: city.mayor });
  if (typeof city.latitude === 'number' && typeof city.longitude === 'number')
    facts.push({
      label: 'Coordinates',
      value: `${city.latitude.toFixed(3)}, ${city.longitude.toFixed(3)}`,
    });
  if (city.postal_codes?.length)
    facts.push({ label: 'Postal codes', value: city.postal_codes.slice(0, 4).join(', ') });
  if (city.area_codes?.length)
    facts.push({ label: 'Area codes', value: city.area_codes.join(', ') });

  const demographics = city.demographics ? Object.entries(city.demographics) : [];
  const costOfLiving = city.cost_of_living ? Object.entries(city.cost_of_living) : [];

  return (
    <div className="flex flex-col gap-12">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.5fr_1fr] md:gap-12">
        {/* Lead essay + cultural detail */}
        <div className="flex flex-col gap-8">
          <p className="text-body-lg leading-relaxed text-muted-foreground">
            {city.description || `Venues, events, and neighborhoods in ${city.name}.`}
          </p>

          {city.local_customs && (
            <div>
              <h3 className="mb-4 text-title font-semibold tracking-tight">Local customs</h3>
              <p className="text-body-lg leading-relaxed text-muted-foreground">
                {city.local_customs}
              </p>
            </div>
          )}

          <ChipCluster heading="Economy" items={city.economy_sectors ?? []} />
          <ChipCluster heading="Universities" items={city.universities ?? []} />
          <ChipCluster heading="Notable landmarks" items={city.notable_landmarks ?? []} />
          <ChipCluster heading="Sister cities" items={city.sister_cities ?? []} />
          <DefinitionGrid heading="Demographics" entries={demographics} />
          <DefinitionGrid heading="Cost of living" entries={costOfLiving} />
        </div>

        {/* Facts aside */}
        {facts.length > 0 && (
          <aside className="md:sticky md:top-32 md:self-start">
            <h3 className="mb-4 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
              City facts
            </h3>
            <dl className="rounded-container border border-border/60 px-4 py-1">
              {facts.map((f) => (
                <FactRow key={f.label} label={f.label} value={f.value} />
              ))}
            </dl>
          </aside>
        )}
      </div>

      {typeof city.latitude === 'number' && typeof city.longitude === 'number' && (
        <WeatherForecast latitude={city.latitude} longitude={city.longitude} cityName={city.name} />
      )}

      {city.id && (
        <PeopleHereRail
          mode="locals"
          cityId={city.id}
          title={`Locals & travelers to meet in ${city.name}`}
          seeAllHref="/community/members"
        />
      )}
    </div>
  );
}
