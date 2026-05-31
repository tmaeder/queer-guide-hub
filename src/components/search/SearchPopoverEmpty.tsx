import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp } from 'lucide-react';
import { type SearchHit } from '@/lib/searchClient';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';
import { DESTINATIONS, NAV_CLUSTERS } from '@/config/navigation';
import { ModeSwitcher } from './ModeSwitcher';

export interface SearchPopoverEmptyProps {
  trending: SearchHit[];
  onSelectTrending: (hit: SearchHit) => void;
  onBrowse: (path: string) => void;
}

export function SearchPopoverEmpty({
  trending,
  onSelectTrending,
  onBrowse,
}: SearchPopoverEmptyProps) {
  const { t } = useTranslation();
  const tiles = trending.slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto" style={{ maxHeight: 520 }}>
      <ModeSwitcher />

      {tiles.length > 0 && (
        <div className="px-3 pb-2 pt-3">
          <div className="mb-2 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp size={11} />
            {t('search.trending', 'Trending')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((hit) => {
              const name = (hit.title || hit.name || '') as string;
              if (!name) return null;
              const Icon = (TYPE_ICONS[hit.type] || TrendingUp) as React.ComponentType<{
                className?: string;
              }>;
              const image = (hit.image_url || hit.cover_image_url || hit.hero_image_url) as
                | string
                | undefined;
              return (
                <button
                  key={`trend-${hit.type}-${hit.id}`}
                  type="button"
                  onClick={() => onSelectTrending(hit)}
                  className="flex cursor-pointer flex-col overflow-hidden border border-border bg-transparent p-0 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex h-20 items-center justify-center overflow-hidden bg-muted">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-xs font-medium">{name}</div>
                    <div className="truncate text-2xs text-muted-foreground">
                      {[hit.city, hit.country].filter(Boolean).join(' · ') || hit.type}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border px-3 pb-4 pt-3">
        {NAV_CLUSTERS.map((cluster) => {
          const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
          if (items.length === 0) return null;
          return (
            <div key={cluster.id} className="mb-2 last:mb-0">
              <div className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(cluster.labelKey)}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => onBrowse(item.to)}
                    className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent p-2 text-left transition-colors hover:bg-accent"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm">{t(item.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
