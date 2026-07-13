import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Image } from '@/components/ui/Image';
import { HomeSection } from './HomeSection';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useRecentlyViewedImages } from '@/hooks/useRecentlyViewedImages';
import { recentlyViewedHref, type RecentlyViewedType } from '@/lib/recentlyViewed';
import { type FallbackTheme } from '@/utils/fallbackImages';

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
    case 'organization':
      return 'default';
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
  // Backfill a real image for entries that were stored without one (pre-capture
  // history); resolves the entity's current image from its source table.
  const resolvedImages = useRecentlyViewedImages(items);

  if (items.length === 0) return null;

  return (
    <HomeSection
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
                <Image
                  imageUrl={it.image ?? resolvedImages[`${it.type}:${it.slug}`]}
                  fallbackEntityType={fallbackTheme(it.type)}
                  fallbackKey={it.slug}
                  imageRole="thumb"
                  heightPx={96}
                  rounded="none"
                  alt=""
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
