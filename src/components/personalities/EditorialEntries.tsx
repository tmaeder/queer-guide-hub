import { ERAS, type EraKey } from '@/lib/personalitiesFilters';
import { useProfessionFacets } from '@/hooks/usePersonalities';
import { useBornThisWeek } from '@/hooks/useBornThisWeek';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Cake, Flower2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface EditorialEntriesProps {
  /** Currently applied era, so we can highlight the active chip. */
  activeEra?: EraKey;
  /** Currently applied profession, so we can highlight the active tile. */
  activeProfession?: string;
  onEraSelect: (era: EraKey | undefined) => void;
  onProfessionSelect: (profession: string | undefined) => void;
}

/**
 * Editorial entry points shown on the default (unfiltered) browse view.
 *
 * Two surfaces:
 *   1. Eras — curated chips that apply a birth_year range filter via
 *      `birth_year_min` / `birth_year_max`.
 *   2. Top fields — top 8 professions rendered as tiles. Reuses the same
 *      `useProfessionFacets` hook the filter bar uses.
 *
 * "Born this week" was scoped out of v1: it requires either a stored
 * generated column on MM-DD or a server-side RPC to be efficient. Tracked
 * as a follow-up.
 */
export function EditorialEntries({
  activeEra,
  activeProfession,
  onEraSelect,
  onProfessionSelect,
}: EditorialEntriesProps) {
  const { t } = useTranslation();
  const { facets } = useProfessionFacets(8);
  const { items: bornThisWeek } = useBornThisWeek(8, 'born');
  const { items: diedThisWeek } = useBornThisWeek(8, 'died');

  const renderStrip = (
    items: typeof bornThisWeek,
    dateField: 'birth_date' | 'death_date',
  ) => (
    <ul className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
      {items.map((p) => {
        const iso = p[dateField];
        const d = iso ? new Date(iso) : null;
        const dateLabel = d
          ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '';
        return (
          <li key={p.id} className="flex-shrink-0 w-32">
            <LocalizedLink
              to={`/personalities/${p.slug ?? p.id}`}
              className="block no-underline text-inherit group"
            >
              <div className="w-32 h-32 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <span className="text-2xl font-bold text-muted-foreground">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium mt-1.5 truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{dateLabel}</p>
            </LocalizedLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="mb-8 space-y-6" aria-label="Browse by era and field">
      {/* Born this week */}
      {bornThisWeek.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Cake size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.bornThisWeek', 'Born this week')}
          </h2>
          {renderStrip(bornThisWeek, 'birth_date')}
        </div>
      )}

      {/* Died this week — remembrance hook */}
      {diedThisWeek.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Flower2 size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.diedThisWeek', 'Remembered this week')}
          </h2>
          {renderStrip(diedThisWeek, 'death_date')}
        </div>
      )}

      {/* Eras */}
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          {t('pages.personalities.editorial.browseByEra', 'Browse by era')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ERAS) as EraKey[]).map((key) => {
            const era = ERAS[key];
            const active = activeEra === key;
            return (
              <Button
                key={key}
                variant={active ? 'default' : 'outline'}
                size="sm"
                onClick={() => onEraSelect(active ? undefined : key)}
                aria-pressed={active}
              >
                {era.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Top fields */}
      {facets.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            {t('pages.personalities.editorial.browseByField', 'Browse by field')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {facets.slice(0, 8).map((f) => {
              const active = activeProfession === f.profession;
              return (
                <button
                  key={f.profession}
                  type="button"
                  onClick={() =>
                    onProfessionSelect(active ? undefined : f.profession)
                  }
                  aria-pressed={active}
                  className={
                    'flex items-center justify-between text-left px-3 py-2.5 border rounded-md transition-colors hover:bg-accent ' +
                    (active ? 'border-foreground bg-accent' : 'border-border')
                  }
                >
                  <span className="text-sm font-medium truncate">
                    {f.profession}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    {f.count.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
