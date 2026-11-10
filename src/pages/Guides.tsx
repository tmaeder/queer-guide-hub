import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BookOpen } from '@/components/icons';
import { useMeta } from '@/hooks/useMeta';
import { useGuides, type GuideFormat } from '@/hooks/useGuides';
import type { GuideEntityType } from '@/lib/guidePickAdapters';
import { GuideCard } from '@/components/guides/GuideCard';
import { GuidesFilterBar, type GuidesHubFilters } from '@/components/guides/GuidesFilterBar';
import { ActiveQuestBanner } from '@/components/guides/ActiveQuestBanner';
import { ContinueReadingRail } from '@/components/guides/ContinueReadingRail';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  PageContainer,
  PAGE_BLEED_MOBILE,
  STICKY_UNDER_HEADER,
} from '@/components/layout/PageContainer';

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
    entity: ENTITIES.includes(rawEntity as GuideEntityType) ? (rawEntity as GuideEntityType) : null,
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

  const lead = !filters.format && !filters.entity && guides[0]?.is_featured
    ? guides[0]
    : undefined;
  const remainingGuides = lead ? guides.slice(1) : guides;

  return (
    <div className="min-h-screen">
      <PageContainer flush className="pb-8">
        <header className="py-4 md:py-8">
          <h1 className="font-display text-headline leading-tight md:text-display">
            {t('guides.hub.title', 'Guides')}
          </h1>
          <p className="mt-2 max-w-reading text-muted-foreground">
            {t('guides.hub.opening', 'Find places worth a stop, ideas for your next trip, and things to do together.')}
          </p>
        </header>
        <ActiveQuestBanner />
        {lead && <div className="mb-6"><GuideCard guide={lead} size="hero" priority /></div>}
        <div
          className={`sticky ${STICKY_UNDER_HEADER} z-20 ${PAGE_BLEED_MOBILE} mb-8 overflow-hidden rounded-container border-b border-border-hairline bg-background py-2`}
        >
          <GuidesFilterBar filters={filters} onChange={setFilters} />
        </div>
        <ContinueReadingRail />

        {isLoading ? (
          <div className="grid grid-cols-12 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="col-span-12 md:col-span-6 lg:col-span-4 rounded-container bg-card overflow-hidden"
              >
                <div className="aspect-[16/9] animate-pulse rounded-container bg-muted" />
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
            {remainingGuides.map((guide, i) => (
              <div key={guide.id} className="col-span-12 md:col-span-6 lg:col-span-4">
                <GuideCard guide={guide} priority={!lead && i < 3} />
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
};

export default Guides;
