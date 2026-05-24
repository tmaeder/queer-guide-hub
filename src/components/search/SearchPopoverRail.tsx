import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X, Navigation, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';

const RAIL_ORDER = [
  'venue',
  'event',
  'city',
  'country',
  'personality',
  'news',
  'marketplace',
  'tag',
  'queer_village',
];

export interface SearchPopoverRailProps {
  query: string;
  activeScope: string | null;
  countsByType: Record<string, number>;
  recents: string[];
  onSelectScope: (scope: string | null) => void;
  onSelectRecent: (term: string) => void;
  onRemoveRecent: (index: number) => void;
  onClearRecents: () => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
  onNearMe: () => void;
  onBrowseAll: () => void;
  focusedIndex: number | null;
}

export function SearchPopoverRail({
  query,
  activeScope,
  countsByType,
  recents,
  onSelectScope,
  onSelectRecent,
  onRemoveRecent,
  onClearRecents,
  nearMeSupported,
  nearMeLoading,
  onNearMe,
  onBrowseAll,
  focusedIndex,
}: SearchPopoverRailProps) {
  const { t } = useTranslation();
  const hasQuery = query.length > 0;
  const totalCount = Object.values(countsByType).reduce((a, b) => a + b, 0);
  const recentItems = recents.slice(0, 3);

  return (
    <div
      role="listbox"
      aria-label={t('search.rail.label', 'Search scopes')}
      className="flex w-[180px] shrink-0 flex-col border-r border-border bg-background"
    >
      <div className="flex-1 overflow-y-auto">
        {!hasQuery && recentItems.length > 0 && (
          <RailSection heading={t('search.recent', 'Recent')}>
            {recentItems.map((term, i) => (
              <RailRow
                key={`recent-${i}`}
                id={`rail-recent-${i}`}
                onClick={() => onSelectRecent(term)}
                trailing={
                  <button
                    type="button"
                    aria-label={t('search.removeRecent', 'Remove')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecent(i);
                    }}
                    className="inline-flex cursor-pointer border-0 bg-transparent p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X size={11} />
                  </button>
                }
              >
                <Clock size={13} className="shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-xs">{term}</span>
              </RailRow>
            ))}
            {recentItems.length > 0 && (
              <button
                type="button"
                onClick={onClearRecents}
                className="block w-full cursor-pointer border-0 bg-transparent px-3 pb-2 pt-1 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {t('search.clearRecent', 'Clear')}
              </button>
            )}
          </RailSection>
        )}

        <RailSection heading={t('search.scopes', 'Scopes')}>
          <ScopeRow
            id="rail-scope-all"
            Icon={Sparkles}
            label={t('search.scope.all', 'All')}
            count={hasQuery ? totalCount : null}
            active={activeScope === null}
            focused={focusedIndex === 0}
            onClick={() => onSelectScope(null)}
          />
          {RAIL_ORDER.map((id, idx) => {
            const meta = CONTENT_TYPES.find((c) => c.id === id);
            if (!meta) return null;
            const Icon = (TYPE_ICONS[id] || Sparkles) as React.ComponentType<{
              className?: string;
            }>;
            const count = hasQuery ? (countsByType[id] ?? 0) : null;
            return (
              <ScopeRow
                key={id}
                id={`rail-scope-${id}`}
                Icon={Icon}
                label={t(`search.scope.${meta.indexKey}`, meta.label)}
                count={count}
                active={activeScope === id}
                focused={focusedIndex === idx + 1}
                onClick={() => onSelectScope(activeScope === id ? null : id)}
              />
            );
          })}
        </RailSection>
      </div>

      <div className="border-t border-border">
        {!hasQuery && nearMeSupported && (
          <RailRow id="rail-nearme" onClick={onNearMe}>
            <Navigation size={13} className="shrink-0 text-muted-foreground" />
            <span className="flex-1 text-xs">{t('search.nearMe', 'Near me')}</span>
            {nearMeLoading && <Loader2 className="animate-spin" size={11} />}
          </RailRow>
        )}
        <RailRow id="rail-browse" onClick={onBrowseAll}>
          <LayoutGrid size={13} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 text-xs">{t('search.browseAll', 'Browse all')}</span>
          <span className="text-2xs text-muted-foreground">→</span>
        </RailRow>
      </div>
    </div>
  );
}

function RailSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="pb-1 pt-2">
      <div className="px-3 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </div>
      {children}
    </div>
  );
}

function RailRow({
  id,
  onClick,
  trailing,
  children,
}: {
  id: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={false}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
      tabIndex={-1}
      className="flex min-h-7 cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent"
    >
      {children}
      {trailing}
    </div>
  );
}

function ScopeRow({
  id,
  Icon,
  label,
  count,
  active,
  focused,
  onClick,
}: {
  id: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number | null;
  active: boolean;
  focused: boolean;
  onClick: () => void;
}) {
  const hasZero = count === 0;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
      tabIndex={-1}
      className={cn(
        'flex min-h-7 cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors',
        active || focused ? 'bg-accent' : 'hover:bg-accent',
        // opacity 0.5 dropped label contrast to 3.69:1 (axe-fail); 0.6 keeps
        // the zero-count visual cue while staying above WCAG AA 4.5:1.
        hasZero && 'opacity-60',
        focused && 'outline outline-1 -outline-offset-1 outline-ring',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-xs">{label}</span>
      {count !== null && (
        <span className="text-2xs text-muted-foreground tabular-nums">
          {count === 0 ? '—' : count}
        </span>
      )}
    </div>
  );
}
