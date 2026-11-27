import { useTranslation } from 'react-i18next';
import { EntityMap } from '@/components/map/EntityMap';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useObservanceNews, useObservancePastYears } from '@/hooks/useObservanceIndex';
import { observanceMarkers, type MappableEvent } from '@/lib/observanceView';

/** The existing detail-page map, fed this occurrence's linked events (already RLS-filtered). */
export function ObservanceEventsMap({ events }: { events: MappableEvent[] }) {
  const markers = observanceMarkers(events);
  if (markers.length === 0) return null;
  return (
    <div className="mt-8">
      <EntityMap
        center={[markers[0].lng, markers[0].lat]}
        zoom={markers.length > 1 ? 2 : 10}
        height={320}
        markers={markers}
      />
    </div>
  );
}

export function ObservanceNews({ observanceId }: { observanceId: string }) {
  const { t, i18n } = useTranslation();
  const { data = [] } = useObservanceNews(observanceId);
  if (data.length === 0) return null;
  return (
    <PageContainer as="section" size="reading" className="pb-12" aria-labelledby="obs-news">
      <h2 id="obs-news" className="text-headline">
        {t('observances.news', 'In the news')}
      </h2>
      <ul className="mt-4 list-none p-0">
        {data.map((a) => (
          <li key={a.id} className="border-b border-border-hairline py-4">
            <LocalizedLink to={`/news/${a.slug}`} className="font-bold">
              {a.title}
            </LocalizedLink>
            <span className="block text-13 text-muted-foreground">
              {new Date(a.published_at).toLocaleDateString(i18n.language || 'en', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}

/** "2025 · 41 cities · 62 events", one line per year. Counted under the reader's RLS. */
export function ObservancePastYears({
  observanceId,
  beforeYear,
}: {
  observanceId: string;
  beforeYear: number;
}) {
  const { t } = useTranslation();
  const { data = [] } = useObservancePastYears(observanceId, beforeYear);
  if (data.length === 0) return null;
  return (
    <PageContainer as="section" size="reading" className="pb-12" aria-labelledby="obs-past">
      <h2 id="obs-past" className="text-headline">
        {t('observances.pastYears', 'Past years')}
      </h2>
      <ul className="mt-4 list-none p-0 tabular-nums">
        {data.map((y) => (
          <li key={y.year} className="border-b border-border-hairline py-2">
            {y.year} · {t('observances.pastCities', '{{count}} cities', { count: y.cities })} ·{' '}
            {t('observances.pastEvents', '{{count}} events', { count: y.events })}
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
