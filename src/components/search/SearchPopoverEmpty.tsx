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

export function SearchPopoverEmpty({ trending, onSelectTrending, onBrowse }: SearchPopoverEmptyProps) {
  const { t } = useTranslation();
  const tiles = trending.slice(0, 6);
  const browseLinks = [
    { label: t('search.quickLinks.places', 'Places'), icon: MapPin, path: '/places' },
    { label: t('search.quickLinks.cities', 'Cities'), icon: Globe, path: '/cities' },
    { label: t('search.quickLinks.eventsWeekend', 'Events this weekend'), icon: CalendarDays, path: '/events?range=weekend' },
    { label: t('search.quickLinks.personalities', 'Personalities'), icon: Users, path: '/personalities' },
    { label: t('search.quickLinks.marketplace', 'Marketplace'), icon: ShoppingBag, path: '/marketplace' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', maxHeight: 480 }}>
      {tiles.length > 0 && (
        <div style={{ padding: '12px 12px 8px' }}>
          <div
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <TrendingUp style={{ height: 11, width: 11 }} />
            {t('search.trending', 'Trending')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {tiles.map((hit) => {
              const name = (hit.title || hit.name || '') as string;
              if (!name) return null;
              const Icon = (TYPE_ICONS[hit.type] || TrendingUp) as React.ComponentType<{ style?: React.CSSProperties }>;
              const image = (hit.image_url || hit.cover_image_url || hit.hero_image_url) as string | undefined;
              return (
                <button
                  key={`trend-${hit.type}-${hit.id}`}
                  type="button"
                  onClick={() => onSelectTrending(hit)}
                  style={{
                    border: '1px solid hsl(var(--border))',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <div
                    style={{
                      height: 80,
                      background: 'hsl(var(--muted))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {image ? (
                      <img src={image} alt="" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Icon style={{ height: 18, width: 18, color: 'hsl(var(--muted-foreground))' }} />
                    )}
                  </div>
                  <div style={{ padding: '6px 8px' }}>
                    <div className="text-xs" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </div>
                    <div
                      className="text-[10px] text-muted-foreground"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {[hit.city, hit.country].filter(Boolean).join(' · ') || hit.type}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 12px 16px', borderTop: tiles.length > 0 ? '1px solid hsl(var(--border))' : 0 }}>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600, marginBottom: 6, padding: '0 4px' }}>
          {t('search.browse', 'Browse')}
        </div>
        {browseLinks.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.path}
              type="button"
              onClick={() => onBrowse(link.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 8px',
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'hsl(var(--accent))';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <Icon style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
              <span className="text-sm">{link.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
