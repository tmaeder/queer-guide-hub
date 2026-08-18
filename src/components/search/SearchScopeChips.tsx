import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { RouteBullet } from '@/components/transit/RouteBullet';

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
};

interface SearchScopeChipsProps {
  activeScope: string | null;
  onScopeChange: (scope: string | null) => void;
}

export function SearchScopeChips({ activeScope, onScopeChange }: SearchScopeChipsProps) {
  const { t } = useTranslation();
  const scopes = SCOPE_ORDER.map((id) => CONTENT_TYPES.find((c) => c.id === id)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );

  return (
    <div
      role="tablist"
      aria-label={t('search.scope.all', 'Search scope')}
      className="flex items-center gap-2 overflow-x-auto px-6 py-2 [scrollbar-width:thin]"
    >
      <ScopeChip
        label={t('search.scope.all', 'All')}
        active={activeScope === null}
        onClick={() => onScopeChange(null)}
      />
      {scopes.map((scope) => {
        const key = SCOPE_I18N_KEY[scope.id];
        const label = key ? t(`search.scope.${key}`, scope.label) : scope.label;
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
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap bg-muted rounded-element py-1 text-13 font-bold transition-colors',
        // A bullet is a circle inside a squared chip: it needs its own optical
        // inset on the leading edge or it kisses the border.
        type ? 'ps-1 pe-4' : 'px-4',
        active ? 'bg-foreground text-background' : 'bg-transparent text-foreground',
      )}
    >
      {/* The bullet keeps its own ink ring even when the chip floods ink —
          `tone="ink"` would erase the ring against the chip's own fill. It
          reads as a bullet ON a plate, which is what it is. */}
      {type && <RouteBullet type={type} size={22} />}
      {label}
    </button>
  );
}
