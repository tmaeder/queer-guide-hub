import { useProfessionFacets } from '@/hooks/usePersonalities';
import { useBornThisWeek } from '@/hooks/useBornThisWeek';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Cake, Flower2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface EditorialEntriesProps {
  /** Currently applied profession, so we can highlight the active tile. */
  activeProfession?: string;
  onProfessionSelect: (profession: string | undefined) => void;
}

/**
 * Editorial entry points shown on the default (unfiltered) browse view:
 * born this week, remembered this week, and the top fields as interchanges.
 *
 * The era selector deliberately does NOT live here any more. This whole block
 * is gated on `!hasAnyFilter`, so putting the P line's five stations inside it
 * meant selecting a station unmounted the line you had just used — the page's
 * primary navigation metaphor vanished at the moment it was engaged. It now
 * renders from the page itself, above the filter bar, and stays lit.
 */
export function EditorialEntries({
  activeProfession,
  onProfessionSelect,
}: EditorialEntriesProps) {
  const { t } = useTranslation();
  const { facets } = useProfessionFacets(8);
  const { items: bornThisWeek } = useBornThisWeek(8, 'born');
  const { items: diedThisWeek } = useBornThisWeek(8, 'died');

  const renderStrip = (items: typeof bornThisWeek, dateField: 'birth_date' | 'death_date') => (
    // `overflow-x-auto` computes overflow-y to auto as well, so the vertical
    // padding is what keeps the hard shadow and the -2px lift from being
    // clipped by the scroll box.
    <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pt-1 pb-2">
      {items.map((p) => {
        const iso = p[dateField];
        const d = iso ? new Date(iso) : null;
        const dateLabel = d
          ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '';
        return (
          <li key={p.id} className="w-32 shrink-0">
            <LocalizedLink
              to={`/personalities/${p.slug ?? p.id}`}
              className="card-lift-sm group block border-[3px] border-foreground bg-background no-underline text-inherit"
            >
              <div className="flex h-32 w-full items-center justify-center overflow-hidden border-b-[3px] border-foreground bg-muted">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <span className="font-display text-headline text-muted-foreground">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-13 font-bold leading-tight">{p.name}</p>
                <p className="truncate text-2xs tabular-nums text-muted-foreground">{dateLabel}</p>
              </div>
            </LocalizedLink>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="mb-8 space-y-6" aria-label="Browse by field">
      {/* Born this week */}
      {bornThisWeek.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            <Cake size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.bornThisWeek', 'Born this week')}
          </h2>
          {renderStrip(bornThisWeek, 'birth_date')}
        </div>
      )}

      {/* Died this week — remembrance hook */}
      {diedThisWeek.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            <Flower2 size={14} aria-hidden="true" />
            {t('pages.personalities.editorial.diedThisWeek', 'Remembered this week')}
          </h2>
          {renderStrip(diedThisWeek, 'death_date')}
        </div>
      )}

      {/* Top fields */}
      {facets.length > 0 && (
        <div>
          <h2 className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('pages.personalities.editorial.browseByField', 'Browse by field')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {facets.slice(0, 8).map((f) => {
              const active = activeProfession === f.profession;
              return (
                // Interchanges off the era line. This tile carried a
                // three-part defect until 2026-08-11: the concatenation had no
                // space before the ternary, so it emitted the class
                // `hover:bg-accentborder-foreground`; there was no `border`
                // width utility, so both `border-*` colours were inert anyway;
                // and the active state was a tint the hover state also used.
                <button
                  key={f.profession}
                  type="button"
                  onClick={() => onProfessionSelect(active ? undefined : f.profession)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center justify-between gap-2 border-2 border-foreground px-4 py-2 text-left transition-colors',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-background hover:bg-surface-container',
                  )}
                >
                  <span className="truncate text-13 font-bold">{f.profession}</span>
                  <span
                    className={cn(
                      'shrink-0 text-2xs tabular-nums',
                      active ? 'text-background/70' : 'text-muted-foreground',
                    )}
                  >
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
