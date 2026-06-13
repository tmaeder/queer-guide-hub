import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { HomeSection } from './HomeSection';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { recentlyViewedHref, type RecentlyViewedType } from '@/lib/recentlyViewed';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

function fallbackTheme(type: RecentlyViewedType): FallbackTheme {
  switch (type) {
    case 'venue':
      return 'venue';
    case 'event':
      return 'event';
    case 'hotel':
      return 'hotel';
    case 'marketplace':
      return 'marketplace';
    case 'personality':
      return 'person';
    default:
      return 'place';
  }
}

/**
 * "Pick up where you left off" — the visitor's own recent entity views from
 * local history. Renders nothing for first-time visitors (self-hiding rail).
 */
export function RecentlyViewedRail() {
  const { t } = useTranslation();
  const items = useRecentlyViewed();

  if (items.length === 0) return null;

  return (
    <HomeSection
      eyebrow={t('home.recentlyViewed.eyebrow', 'Recently viewed')}
      title={t('home.recentlyViewed.title', 'Pick up where you left off.')}
    >
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {items.map((it) => (
            <LocalizedLink
              key={`${it.type}:${it.slug}`}
              to={recentlyViewedHref(it)}
              className="shrink-0 w-56 no-underline"
            >
              <Card className="h-40 overflow-hidden transition">
                <img
                  src={
                    isValidImageUrl(it.image)
                      ? (it.image as string)
                      : getFallbackImage(fallbackTheme(it.type), it.slug)
                  }
                  alt=""
                  role="presentation"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-24 w-full object-cover"
                  onError={(e) => {
                    const fb = getFallbackImage(fallbackTheme(it.type), it.slug);
                    if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                  }}
                />
                <CardContent className="p-2">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[it.city, it.country].filter(Boolean).join(', ')}
                  </div>
                </CardContent>
              </Card>
            </LocalizedLink>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </HomeSection>
  );
}
