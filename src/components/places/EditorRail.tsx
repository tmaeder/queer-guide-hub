import { useMemo } from 'react';
import { GeoCard, type GeoCardVariant } from '@/components/places/GeoCard';
import { useOptimizedCountries, useOptimizedCities } from '@/hooks/usePlaces';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import type { EditorialRail as EditorialRailType } from '@/hooks/useEditorialRails';
import { usePlacesPassport } from '@/hooks/usePlacesPassport';

interface Props {
  rail: EditorialRailType;
}

export function EditorRail({ rail }: Props) {
  const { countries } = useOptimizedCountries();
  const { cities } = useOptimizedCities();
  const { villages } = useQueerVillages(true);
  const { data: passport } = usePlacesPassport();

  const orderedIds = useMemo(
    () => rail.items.sort((a, b) => a.position - b.position).map((i) => i.entity_id),
    [rail.items],
  );

  const cards = useMemo(() => {
    if (orderedIds.length === 0) return [];
    if (rail.entity_type === 'country') {
      const byId = new Map((countries ?? []).map((c) => [c.id as string, c]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    }
    if (rail.entity_type === 'city') {
      const byId = new Map((cities ?? []).map((c) => [c.id as string, c]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    }
    const byId = new Map((villages ?? []).map((v) => [v.id as string, v]));
    return orderedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [rail.entity_type, orderedIds, countries, cities, villages]);

  if (cards.length === 0) return null;

  return (
    <section aria-label={rail.title} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-headline-lg md:text-display font-semibold leading-tight tracking-tight">
          {rail.title}
        </h2>
        {rail.editor_note && (
          <p className="text-15 text-muted-foreground max-w-2xl">{rail.editor_note}</p>
        )}
      </header>

      <div
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2"
        role="list"
      >
        {cards.map((entity) => {
          if (!entity) return null;
          const id = entity.id as string;
          return (
            <div
              key={id}
              role="listitem"
              className="snap-start shrink-0 w-[260px] md:w-[280px]"
            >
              <RailCardForEntity rail={rail} entity={entity} passport={passport} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RailCardForEntity({
  rail,
  entity,
  passport,
}: {
  rail: EditorialRailType;
  entity: Record<string, unknown>;
  passport: ReturnType<typeof usePlacesPassport>['data'];
}) {
  const variant = rail.entity_type as GeoCardVariant;
  const id = entity.id as string;

  const visited =
    variant === 'country' ? passport?.visitedCountryIds.has(id)
    : variant === 'city' ? passport?.visitedCityIds.has(id)
    : passport?.visitedVillageIds.has(id);

  return (
    <GeoCard
      variant={variant}
      id={id}
      slug={(entity.slug as string | null) ?? null}
      name={(entity.name as string) ?? ''}
      nameI18n={(entity.name_i18n as Record<string, unknown> | null) ?? null}
      imageUrl={(entity.image_url as string | null) ?? null}
      editorialHook={(entity.editorial_hook as string | null) ?? null}
      capital={variant === 'country' ? ((entity.capital as string | null) ?? null) : null}
      countryName={
        variant === 'city'
          ? ((entity.countries as { name?: string } | undefined)?.name ?? null)
          : null
      }
      isCapital={variant === 'city' ? !!entity.is_capital : false}
      description={variant === 'village' ? ((entity.description as string | null) ?? null) : null}
      descriptionI18n={
        variant === 'village'
          ? ((entity.description_i18n as Record<string, unknown> | null) ?? null)
          : null
      }
      legalityData={variant === 'country' ? (entity as never) : undefined}
      visited={!!visited}
    />
  );
}
