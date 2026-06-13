import React from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Sparkles, Clock, X } from 'lucide-react';
import { type SearchHit } from '@/lib/searchClient';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';
import { DESTINATIONS, NAV_CLUSTERS } from '@/config/navigation';
import type { EntityMapMarker } from '@/components/map/EntityMap';
import { ModeSwitcher } from './ModeSwitcher';
import { SearchMapPeek } from './SearchMapPeek';

export interface SearchPopoverEmptyProps {
  trending: SearchHit[];
  /** Fill the parent (mobile full-screen sheet) instead of the desktop 560px cap. */
  fullHeight?: boolean;
  /** Whether `trending` is the personalized recommendations feed or plain trending. */
  source?: 'recommended' | 'trending';
  onSelectTrending: (hit: SearchHit) => void;
  onBrowse: (path: string) => void;
  onAsk: () => void;
  onExploreMap: (center?: { lat: number; lng: number }) => void;
  onNearMe: () => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
  recents?: string[];
  onSelectRecent?: (term: string) => void;
  onClearRecents?: () => void;
}

/** Pull a [lng, lat] coordinate out of a discovery hit if present. */
function hitMarker(hit: SearchHit): EntityMapMarker | null {
  const geo = hit._geoloc as { lat?: number; lng?: number } | undefined;
  const lat = geo?.lat ?? (hit.lat as number | undefined) ?? (hit.latitude as number | undefined);
  const lng = geo?.lng ?? (hit.lng as number | undefined) ?? (hit.longitude as number | undefined);
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return {
    id: String(hit.id ?? hit.objectID ?? `${lat},${lng}`),
    lat,
    lng,
    name: (hit.title || hit.name || '') as string,
    type: hit.type === 'event' ? 'events' : 'venues',
  };
}

export function SearchPopoverEmpty({
  trending,
  fullHeight = false,
  source = 'trending',
  onSelectTrending,
  onBrowse,
  onAsk,
  onExploreMap,
  onNearMe,
  nearMeSupported,
  nearMeLoading,
  recents = [],
  onSelectRecent,
  onClearRecents,
}: SearchPopoverEmptyProps) {
  const { t } = useTranslation();
  const tiles = trending.slice(0, 6);
  const recentItems = recents.slice(0, 5);
  const markers = trending.map(hitMarker).filter((m): m is EntityMapMarker => m !== null);
  const heading =
    source === 'recommended' ? t('search.forYou', 'For you') : t('search.trending', 'Trending');

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={fullHeight ? undefined : { maxHeight: 560 }}
    >
      {recentItems.length > 0 && onSelectRecent && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {recentItems.map((term, i) => (
            <span
              key={`recent-${i}`}
              className="inline-flex items-center gap-1 rounded-badge border border-border px-2 py-1 text-xs"
            >
              <button
                type="button"
                onClick={() => onSelectRecent(term)}
                className="max-w-[140px] cursor-pointer truncate bg-transparent p-0 text-foreground"
              >
                {term}
              </button>
            </span>
          ))}
          {onClearRecents && (
            <button
              type="button"
              onClick={onClearRecents}
              className="ml-1 inline-flex cursor-pointer items-center gap-1 bg-transparent p-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label={t('search.clearRecent', 'Clear')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <SearchMapPeek
        markers={markers}
        onExplore={onExploreMap}
        onNearMe={onNearMe}
        nearMeSupported={nearMeSupported}
        nearMeLoading={nearMeLoading}
      />

      <button
        type="button"
        onClick={onAsk}
        className="mt-4 flex w-full items-center gap-2 border-y border-border px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-accent"
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        {t('search.ask.entry', 'Ask the guide a question')}
        <span className="ml-auto shrink-0 text-muted-foreground">→</span>
      </button>

      {tiles.length > 0 && (
        <div className="px-4 pb-2 pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            {heading}
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
                  className="flex cursor-pointer flex-col overflow-hidden rounded-element border border-border bg-transparent p-0 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex h-24 items-center justify-center overflow-hidden bg-muted">
                    {image ? (
                      <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="px-2 py-2">
                    <div className="truncate text-13 font-semibold">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[hit.city, hit.country].filter(Boolean).join(' · ') || hit.type}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-t border-border pb-2 pt-2">
        <ModeSwitcher />
      </div>

      <div className="border-t border-border px-4 pb-4 pt-4">
        {NAV_CLUSTERS.map((cluster) => {
          const items = DESTINATIONS.filter((d) => d.cluster === cluster.id);
          if (items.length === 0) return null;
          return (
            <div key={cluster.id} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
                {t(cluster.labelKey)}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => onBrowse(item.to)}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-element border-0 bg-transparent px-2 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
