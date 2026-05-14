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

/** Keys not worth showing in the fallback — already in detail header or internal */
const HIDDEN_KEYS = new Set([
  'id', 'entity_id', 'entity_table', 'queue_type', 'content_type',
  'title', 'subtitle', 'status', 'confidence_score', 'created_at',
  'updated_at', 'has_diff', 'reporter_id', 'source', 'meta',
  'normalized_data', 'raw_data', 'source_data', 'priority_score',
]);

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value.length > 200) return value.slice(0, 200) + '…';
    return value;
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(String).join(', ');
  return JSON.stringify(value);
}

function formatFieldKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function FallbackPreview({ item }: { item: TriageItem }) {
  // Extract visible fields from meta (structured, not JSON dump)
  const metaFields = item.meta
    ? Object.entries(item.meta).filter(
        ([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== undefined && v !== '',
      )
    : [];

  return (
    <div className="p-4 space-y-3">
      {item.subtitle && (
        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
      )}

      {metaFields.length > 0 && (
        <div className="divide-y border">
          {metaFields.map(([key, value]) => (
            <div key={key} className="flex gap-3 px-3 py-2 text-xs">
              <span className="text-muted-foreground shrink-0 w-28 text-[10px] uppercase tracking-wider">
                {formatFieldKey(key)}
              </span>
              <span className="min-w-0 break-words">{formatFieldValue(value)}</span>
            </div>
          ))}
        </div>
      )}

      {metaFields.length === 0 && !item.subtitle && (
        <p className="text-xs text-muted-foreground">No preview available.</p>
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
