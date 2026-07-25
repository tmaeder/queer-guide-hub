import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { useGuides, type GuideFormat } from '@/hooks/useGuides';
import type { GuideEntityType } from '@/lib/guidePickAdapters';
import { GuideCard } from '@/components/guides/GuideCard';
import { GuidesFilterBar, type GuidesHubFilters } from '@/components/guides/GuidesFilterBar';
import { ActiveQuestBanner } from '@/components/guides/ActiveQuestBanner';
import { ContinueReadingRail } from '@/components/guides/ContinueReadingRail';
import { PageHero } from '@/components/discovery';
import { EmptyState } from '@/components/ui/EmptyState';

const FORMATS: GuideFormat[] = ['guide', 'list', 'quest'];
const ENTITIES: GuideEntityType[] = [
  'venue',
  'event',
  'marketplace',
  'city',
  'country',
  'queer_village',
];

const Guides = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawFormat = searchParams.get('format');
  const rawEntity = searchParams.get('entity');
  const filters: GuidesHubFilters = {
    format: FORMATS.includes(rawFormat as GuideFormat) ? (rawFormat as GuideFormat) : null,
    entity: ENTITIES.includes(rawEntity as GuideEntityType)
      ? (rawEntity as GuideEntityType)
      : null,
  };

  const { data: guides = [], isLoading } = useGuides({
    format: filters.format ?? undefined,
    entityType: filters.entity ?? undefined,
  });

  useMeta({
    title: t('guides.hub.title', 'Guides'),
    description: t(
      'guides.hub.metaDescription',
      'Editor-written guides, curated lists and community quests across LGBTQ+ places, events and shopping.',
    ),
    canonicalPath: '/guides',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Guides',
      url: 'https://queer.guide/guides',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const setFilters = (next: GuidesHubFilters) => {
    const params = new URLSearchParams();
    if (next.format) params.set('format', next.format);
    if (next.entity) params.set('entity', next.entity);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="min-h-screen">
      <PageHero
        eyebrow={t('guides.hub.eyebrow', 'Editorial')}
        title={t('guides.hub.title', 'Guides')}
        lede={t(
          'guides.hub.lede',
          'Comparison-driven guides, curated lists and community quests — written by editors, no fluff.',
        )}
        size="md"
      />
      <div className="container mx-auto py-8 md:py-12 px-4">
        <ActiveQuestBanner />
        <div className="mb-8">
          <GuidesFilterBar filters={filters} onChange={setFilters} />
        </div>
        <ContinueReadingRail />

        {isLoading ? (
          <div className="grid grid-cols-12 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="col-span-12 md:col-span-6 lg:col-span-4 rounded-container border border-border bg-card overflow-hidden"
              >
                <div className="aspect-[16/9] bg-muted animate-pulse" />
                <div className="p-6 space-y-2">
                  <div className="h-3 w-24 bg-muted animate-pulse rounded-badge" />
                  <div className="h-6 w-3/4 bg-muted animate-pulse rounded-element" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded-element" />
                </div>
              </div>
            ))}
          </div>
        ) : guides.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={t('guides.hub.empty', 'No guides yet.')}
            description={t('guides.hub.emptyHint', 'New guides land regularly. Check back soon.')}
          />
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {guides.map((g, i) =>
              i === 0 && g.is_featured && filters.format === null && filters.entity === null ? (
                <GuideCard key={g.id} guide={g} size="hero" priority />
              ) : (
                <div key={g.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                  <GuideCard guide={g} priority={i < 3} />
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Guides;
