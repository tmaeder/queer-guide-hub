import {
  Building2,
  CalendarDays,
  ShoppingBag,
  Newspaper,
  Users,
  Globe,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';

const SCOPE_ICONS: Record<string, typeof Building2> = {
  venue: Building2,
  event: CalendarDays,
  marketplace: ShoppingBag,
  news: Newspaper,
  personality: Users,
  city: Globe,
  country: Globe,
  queer_village: MapPin,
};

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
      className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-4 py-2 [scrollbar-width:thin]"
    >
      <ScopeChip
        label={t('search.scope.all', 'All')}
        Icon={Sparkles}
        active={activeScope === null}
        onClick={() => onScopeChange(null)}
      />
      {scopes.map((scope) => {
        const Icon = SCOPE_ICONS[scope.id] || Sparkles;
        const key = SCOPE_I18N_KEY[scope.id];
        const label = key ? t(`search.scope.${key}`, scope.label) : scope.label;
        return (
          <ScopeChip
            key={scope.id}
            label={label}
            Icon={Icon}
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
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof Building2;
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
        'inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap border border-border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-transparent text-foreground hover:bg-accent',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
