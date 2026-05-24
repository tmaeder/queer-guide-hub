import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, CalendarDays, Globe, Users, ShoppingBag, TrendingUp } from 'lucide-react';
import { type SearchHit } from '@/lib/searchClient';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';

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
  const browseLinks = [
    { label: t('search.quickLinks.places', 'Places'), icon: MapPin, path: '/places' },
    { label: t('search.quickLinks.cities', 'Cities'), icon: Globe, path: '/cities' },
    {
      label: t('search.quickLinks.eventsWeekend', 'Events this weekend'),
      icon: CalendarDays,
      path: '/events?range=weekend',
    },
    {
      label: t('search.quickLinks.personalities', 'Personalities'),
      icon: Users,
      path: '/personalities',
    },
    {
      label: t('search.quickLinks.marketplace', 'Marketplace'),
      icon: ShoppingBag,
      path: '/marketplace',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
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

      <div className={tiles.length > 0 ? 'border-t border-border px-3 pb-4 pt-3' : 'px-3 pb-4 pt-3'}>
        <div className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('search.browse', 'Browse')}
        </div>
        {browseLinks.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.path}
              type="button"
              onClick={() => onBrowse(link.path)}
              className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent p-2 text-left transition-colors hover:bg-accent"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm">{link.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
