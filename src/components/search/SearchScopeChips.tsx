import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';

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
];

const SCOPE_I18N_KEY: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  marketplace: 'marketplace',
  news: 'news',
  personality: 'people',
  city: 'cities',
  country: 'cities',
  queer_village: 'places',
  tag: 'tags',
};

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
}

export function SearchScopeChips({
  activeScope,
  onScopeChange,
  variant = 'row',
}: SearchScopeChipsProps) {
  const { t } = useTranslation();
  const scopes = SCOPE_ORDER.map((id) => CONTENT_TYPES.find((c) => c.id === id)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  const labelFor = (scope: (typeof scopes)[number]) => {
    const key = SCOPE_I18N_KEY[scope.id];
    return key ? t(`search.scope.${key}`, scope.label) : scope.label;
  };
  const allLabel = t('search.scope.all', 'All');

  if (variant === 'grid') {
    // Every scope stays visible and nothing scrolls sideways: a 5×2 grid of
    // mark-over-label cells, like a tab bar. Labels must stay short to fit a
    // fifth of a 375px sheet, so Marketplace uses the nav's own word, Shop.
    return (
      <div
        role="group"
        aria-label={t('search.scopeLabel', 'Search scope')}
        className="grid grid-cols-5 gap-1 px-4 py-2"
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
                  : 'text-foreground hover:bg-surface-container',
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
    );
  }

  return (
    <div
      role="group"
      aria-label={t('search.scopeLabel', 'Search scope')}
      // One row that scrolls sideways; the fading trailing edge says "more this
      // way" instead of a scrollbar. Chips go flat in here: a soft shadow is
      // clipped at a scroller's edge.
      className="flex snap-x items-center gap-2 overflow-x-auto scroll-px-6 px-6 py-2 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_.shadow-soft]:shadow-none [&_.shadow-soft]:ring-1 [&_.shadow-soft]:ring-surface-container-high"
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
  active,
  onClick,
}: {
  label: string;
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
          {type && <RouteBullet type={type} size={22} />}
          {label}
        </>
      }
    />
  );
}
