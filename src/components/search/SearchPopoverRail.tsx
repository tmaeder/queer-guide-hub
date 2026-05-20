import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X, Navigation, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';

const RAIL_ORDER = ['venue', 'event', 'city', 'country', 'personality', 'news', 'marketplace', 'tag', 'queer_village'];

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
      style={{
        width: 180,
        flexShrink: 0,
        borderRight: '1px solid hsl(var(--border))',
        display: 'flex',
        flexDirection: 'column',
        background: 'hsl(var(--background))',
      }}
    >
      <div style={{ overflowY: 'auto', flex: 1 }}>
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
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'hsl(var(--muted-foreground))',
                      padding: 2,
                      display: 'inline-flex',
                    }}
                  >
                    <X style={{ height: 11, width: 11 }} />
                  </button>
                }
              >
                <Clock style={{ height: 13, width: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                <span
                  className="text-xs"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                >
                  {term}
                </span>
              </RailRow>
            ))}
            {recentItems.length > 0 && (
              <button
                type="button"
                onClick={onClearRecents}
                className="text-xs"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 12px 8px',
                  border: 0,
                  background: 'transparent',
                  color: 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                }}
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
            const Icon = (TYPE_ICONS[id] || Sparkles) as React.ComponentType<{ style?: React.CSSProperties }>;
            const count = hasQuery ? countsByType[id] ?? 0 : null;
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

      <div style={{ borderTop: '1px solid hsl(var(--border))' }}>
        {!hasQuery && nearMeSupported && (
          <RailRow id="rail-nearme" onClick={onNearMe}>
            <Navigation style={{ height: 13, width: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            <span className="text-xs" style={{ flex: 1 }}>{t('search.nearMe', 'Near me')}</span>
            {nearMeLoading && <Loader2 className="animate-spin" style={{ height: 11, width: 11 }} />}
          </RailRow>
        )}
        <RailRow id="rail-browse" onClick={onBrowseAll}>
          <LayoutGrid style={{ height: 13, width: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
          <span className="text-xs" style={{ flex: 1 }}>{t('search.browseAll', 'Browse all')}</span>
          <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>→</span>
        </RailRow>
      </div>
    </div>
  );
}

function RailSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
      <div
        className="text-[10px] uppercase tracking-wider text-muted-foreground"
        style={{ padding: '4px 12px 6px', fontWeight: 600 }}
      >
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        minHeight: 28,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--accent))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
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
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        cursor: 'pointer',
        minHeight: 28,
        background: active || focused ? 'hsl(var(--accent))' : 'transparent',
        opacity: hasZero ? 0.5 : 1,
        outline: focused ? '1px solid hsl(var(--ring))' : 'none',
        outlineOffset: -1,
      }}
      onMouseEnter={(e) => {
        if (active || focused) return;
        (e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--accent))';
      }}
      onMouseLeave={(e) => {
        if (active || focused) return;
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      <Icon style={{ height: 13, width: 13, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
      <span className="text-xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {count !== null && (
        <span
          className="text-[11px]"
          style={{ color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums' }}
        >
          {count === 0 ? '—' : count}
        </span>
      )}
    </div>
  );
}
