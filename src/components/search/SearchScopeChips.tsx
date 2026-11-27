import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { scopeLabel } from '@/lib/searchScopeLabel';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { SlidersHorizontal } from '@/components/icons';

// The lucide SCOPE_ICONS map that used to live here is gone. Every scope is a
// content type, and a content type already has a bullet: the letter says what
// it is and the colour says which line. Two parallel icon vocabularies for one
// concept is exactly the "never mix TransitIcon and lucide in the same
// surface" rule, and the bullets match the rows the chips filter.

const SCOPE_ORDER = [
  'venue',
  'event',
  'marketplace',
  'news',
  'personality',
  'city',
  'queer_village',
  'tag',
  'milestone',
  'country',
  'organization',
  'guide',
];

// The phone sheet's grid keeps the nine cells it was laid out for (5×2 with
// All). The later types still have a chip in the results-page row, which
// scrolls; the grid cannot without a third row of mostly empty cells.
const GRID_SCOPES = SCOPE_ORDER.slice(0, 8);

interface SearchScopeChipsProps {
  activeScope: string | null;
  onScopeChange: (scope: string | null) => void;
  /**
   * `row` (default): every scope as a chip in one line — for the desktop
   * popover and the results page, which have the width.
   * `grid`: all nine as a 5×2 grid — for the phone sheet, where nine chips
   * only fit in a row by scrolling sideways.
   */
  variant?: 'row' | 'grid';
  /**
   * Result count per scope, shown on each chip in the `row` variant. Only pass
   * EXACT per-type totals (the grouped overview's), never the type facet: the
   * facet counts a wider candidate set than a scoped search returns, so for
   * "berlin" it says 40 cities while the Cities list holds 2.
   *
   * A scope missing from `counts` has no results (shown as 0). A scope set to
   * `null` has an UNKNOWN count (its search failed) and shows no number:
   * showing 0 there would tell the reader a type is empty when it was never
   * searched.
   */
  counts?: Record<string, number | null>;
}

function chipCount(counts: Record<string, number | null> | undefined, id: string) {
  if (!counts) return undefined;
  const n = counts[id];
  if (n === null) return undefined;
  return n ?? 0;
}

export function SearchScopeChips({
  activeScope,
  onScopeChange,
  variant = 'row',
  counts,
}: SearchScopeChipsProps) {
  const { t } = useTranslation();
  const scopes = (variant === 'grid' ? GRID_SCOPES : SCOPE_ORDER)
    .map((id) => CONTENT_TYPES.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const labelFor = (scope: (typeof scopes)[number]) => scopeLabel(t, scope.id);
  const allLabel = t('search.scope.all', 'All');

  if (variant === 'grid') {
    // Every scope stays visible and nothing scrolls sideways: a 5×2 grid of
    // mark-over-label cells, like a tab bar. Labels must stay short to fit a
    // fifth of a 375px sheet, so Marketplace uses the nav's own word, Shop.
    // Read as a filter, not as more links: a labelled, tinted tray holding
    // one selected cell, like a segmented control.
    return (
      <div className="px-4 pb-2 pt-4">
        <p
          aria-hidden
          className="mb-1.5 flex items-center gap-1.5 px-2 text-2xs font-bold uppercase tracking-label text-muted-foreground"
        >
          <SlidersHorizontal size={12} aria-hidden />
          {t('search.searchIn', 'Search in')}
        </p>
        <div
          role="group"
          aria-label={t('search.scopeLabel', 'Search scope')}
          className="grid grid-cols-5 gap-1 rounded-container bg-muted p-1"
        >
          {[null, ...scopes].map((scope) => {
            const id = scope?.id ?? null;
            const selected = activeScope === id;
            const label = !scope
              ? allLabel
              : scope.id === 'marketplace'
                ? t('search.scope.shop', 'Shop')
                : labelFor(scope);
            return (
              <button
                key={id ?? 'all'}
                type="button"
                aria-pressed={selected}
                // Re-selecting the active scope clears it, as the chips do.
                onClick={() => onScopeChange(selected ? null : id)}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-element px-1 py-1.5 text-xs2 font-bold transition-colors',
                  selected
                    ? 'bg-foreground text-background'
                    : 'text-foreground hover:bg-surface-container-high',
                )}
              >
                {scope ? (
                  <RouteBullet type={scope.id} size={24} />
                ) : (
                  <span className="grid size-6 place-items-center" aria-hidden>
                    <TransitIcon name="search" size={20} />
                  </span>
                )}
                <span className="max-w-full truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t('search.scopeLabel', 'Search scope')}
      // One row that scrolls sideways; the fading edge (index.css) says "more this
      // way" instead of a scrollbar. Chips go flat in here: a soft shadow is
      // clipped at a scroller's edge.
      className="flex snap-x items-center gap-2 overflow-x-auto scroll-px-6 px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_.shadow-soft]:shadow-none [&_.shadow-soft]:ring-1 [&_.shadow-soft]:ring-surface-container-high"
    >
      <ScopeChip
        label={allLabel}
        active={activeScope === null}
        onClick={() => onScopeChange(null)}
      />
      {scopes.map((scope) => {
        const label = labelFor(scope);
        return (
          <ScopeChip
            key={scope.id}
            type={scope.id}
            label={label}
            count={chipCount(counts, scope.id)}
            active={activeScope === scope.id}
            onClick={() => onScopeChange(activeScope === scope.id ? null : scope.id)}
          />
        );
      })}
    </div>
  );
}

function ScopeChip({
  label,
  type,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  /** Omitted on "All", which is not a content type and so has no bullet. */
  type?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <FilterChip
      active={active}
      onClick={onClick}
      // A bullet is a circle inside a squared chip: it needs its own optical
      // inset on the leading edge or it kisses the border.
      className={cn('snap-start whitespace-nowrap', type ? 'ps-1.5 pe-3' : 'px-4')}
      label={
        <>
          {/* The bullet keeps its own ink ring even when the chip floods ink —
              `tone="ink"` would erase the ring against the chip's own fill. */}
          {/* Decorative: the chip text already names the scope, so the bullet's own
              label would only repeat it ("Event Events 560"). */}
          {type && <RouteBullet type={type} size={22} decorative />}
          {label}
          {count !== undefined && (
            <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>
              {count.toLocaleString()}
            </span>
          )}
        </>
      }
    />
  );
}
