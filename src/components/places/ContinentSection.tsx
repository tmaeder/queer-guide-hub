import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { GeoCard } from '@/components/places/GeoCard';
import { usePlacesPassport } from '@/hooks/usePlacesPassport';

interface Country {
  id: string;
  name: string;
  slug?: string | null;
  capital?: string | null;
  continent_id?: string | null;
  image_url?: string | null;
  editorial_hook?: string | null;
  equality_score?: number | null;
  [k: string]: unknown;
}

interface Continent {
  id: string;
  name: string;
}

interface Props {
  continents: Continent[];
  countries: Country[];
  /** Open by default? Use for the "featured continents" up-top. */
  defaultExpandedIds?: string[];
  title?: string;
  description?: string;
}

const GRID = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

export function ContinentSection({
  continents,
  countries,
  defaultExpandedIds,
  title = 'Browse by continent',
  description,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of defaultExpandedIds ?? []) initial[id] = true;
    return initial;
  });
  const { data: passport } = usePlacesPassport();

  const grouped = useMemo(() => {
    return continents
      .map((c) => {
        const list = countries
          .filter((co) => co.continent_id === c.id)
          .sort((a, b) => {
            const aS = a.equality_score ?? null;
            const bS = b.equality_score ?? null;
            if (aS == null && bS == null) return a.name.localeCompare(b.name);
            if (aS == null) return 1;
            if (bS == null) return -1;
            return bS - aS;
          });
        return { continent: c, list };
      })
      .filter(({ list }) => list.length > 0);
  }, [continents, countries]);

  if (grouped.length === 0) {
    return (
      <div className={GRID}>
        {countries.slice(0, 24).map((country, idx) => (
          <GeoCard
            key={country.id}
            variant="country"
            id={country.id}
            slug={country.slug ?? null}
            name={country.name}
            nameI18n={(country.name_i18n as Record<string, unknown> | null) ?? null}
            imageUrl={country.image_url ?? null}
            editorialHook={country.editorial_hook ?? null}
            capital={country.capital ?? null}
            legalityData={country as never}
            visited={!!passport?.visitedCountryIds.has(country.id)}
            priority={idx < 6}
          />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={title} className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-headline-lg md:text-display font-semibold leading-tight tracking-tight">
            {title}
          </h2>
          {description && <p className="text-15 text-muted-foreground max-w-2xl">{description}</p>}
        </div>
        <Badge variant="secondary" className="font-medium">
          {countries.length} countries
        </Badge>
      </header>

      <div className="flex flex-col gap-6">
        {grouped.map(({ continent, list }) => {
          const isOpen = !!expanded[continent.id];
          return (
            <div key={continent.id} className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [continent.id]: !prev[continent.id] }))
                }
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 p-4 bg-muted hover:opacity-85 transition-opacity text-left rounded-element"
              >
                <div className="flex items-center gap-4">
                  <Globe className="h-5 w-5" />
                  <div>
                    <p className="text-title font-semibold">{continent.name}</p>
                    <p className="text-15 text-muted-foreground">{list.length} countries</p>
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>

              {isOpen && (
                <div className={GRID}>
                  {list.map((country, idx) => (
                    <GeoCard
                      key={country.id}
                      variant="country"
                      id={country.id}
                      slug={country.slug ?? null}
                      name={country.name}
                      nameI18n={(country.name_i18n as Record<string, unknown> | null) ?? null}
                      imageUrl={country.image_url ?? null}
                      editorialHook={country.editorial_hook ?? null}
                      capital={country.capital ?? null}
                      legalityData={country as never}
                      visited={!!passport?.visitedCountryIds.has(country.id)}
                      priority={idx < 4}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
