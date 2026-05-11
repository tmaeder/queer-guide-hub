import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

const VenueCard = lazy(() =>
  import('@/components/venues/VenueCard').then((m) => ({ default: m.VenueCard })),
);
const EventCard = lazy(() =>
  import('@/components/events/EventCard').then((m) => ({ default: m.default })),
);
const NewsCard = lazy(() =>
  import('@/components/news/NewsCard').then((m) => ({ default: m.NewsCard })),
);
const PersonalityCard = lazy(() =>
  import('@/components/personalities/PersonalityCard').then((m) => ({
    default: m.PersonalityCard,
  })),
);

interface EntityPreviewCardProps {
  item: TriageItem;
  entityData: Record<string, unknown> | null;
}

function FallbackPreview({ item }: { item: TriageItem }) {
  return (
    <div className="p-3 space-y-2">
      <p className="text-sm font-medium">{item.title}</p>
      {item.subtitle && (
        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
      )}
      {item.meta && Object.keys(item.meta).length > 0 && (
        <pre className="text-[10px] text-muted-foreground bg-muted p-2 overflow-auto max-h-48">
          {JSON.stringify(item.meta, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function EntityPreviewCard({ item, entityData }: EntityPreviewCardProps) {
  const table = item.entity_table ?? item.content_type;

  if (!entityData) {
    return <FallbackPreview item={item} />;
  }

  const loading = (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = entityData as any;

  switch (table) {
    case 'venues':
      return (
        <Suspense fallback={loading}>
          <VenueCard venue={data} />
        </Suspense>
      );
    case 'events':
      return (
        <Suspense fallback={loading}>
          <EventCard event={data} />
        </Suspense>
      );
    case 'news_articles':
      return (
        <Suspense fallback={loading}>
          <NewsCard article={data} />
        </Suspense>
      );
    case 'personalities':
      return (
        <Suspense fallback={loading}>
          <PersonalityCard personality={data} />
        </Suspense>
      );
    default:
      return <FallbackPreview item={item} />;
  }
}
