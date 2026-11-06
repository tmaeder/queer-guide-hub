import { Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Band } from '@/components/home/Band';
import { DeferredSection } from '@/components/home/DeferredSection';
import { CityCardsSkeleton } from '@/components/home/subway/CityCardsSkeleton';
import { DeparturesBoard } from '@/components/home/subway/DeparturesBoard';
import { HomeRegionProvider } from '@/components/home/HomeRegionProvider';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { SupportBand } from '@/components/home/subway/SupportBand';
import { IntentMap } from '@/components/home/subway/IntentMap';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { lazyRetry } from '@/utils/lazyRetry';

const YourLines = lazyRetry(() => import('@/components/home/YourLines'));
const CityCards = lazyRetry(() => import('@/components/home/subway/CityCards'));
const cityCardsLoading = <CityCardsSkeleton />;

const browseLinks = [
  { to: '/travel', label: 'header.intents.travelling.label' },
  { to: '/hub/people', label: 'header.intents.meet.label' },
  { to: '/tags/rights-by-country', label: 'knowledge.rights' },
  { to: '/news', label: 'breadcrumb.news' },
  { to: '/history', label: 'knowledge.history' },
  { to: '/tags', label: 'knowledge.terms' },
  { to: '/marketplace', label: 'breadcrumb.marketplace' },
] as const;

function HomeSection({ section, children }: { section: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      section={section}
      fallback={({ onRetry }) => (
        <PageContainer>
          <HomeSectionError onRetry={onRetry} />
        </PageContainer>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function RegionalContent({ showRegionPicker = true }: { showRegionPicker?: boolean }) {
  const { t } = useTranslation();

  return (
    <>
      <HomeSection section="departures">
        <DeparturesBoard showRegionPicker={showRegionPicker} />
      </HomeSection>
      <HomeSection section="cities">
        <Band
          surface="tint"
          title={t('home.discovery.cityGuides', 'City guides')}
          seeAllHref="/cities"
          seeAllLabel={t('home.discovery.allCities', 'All cities')}
        >
          <DeferredSection rootMargin="160px 0px" fallback={cityCardsLoading}>
            <Suspense fallback={cityCardsLoading}>
              <CityCards />
            </Suspense>
          </DeferredSection>
        </Band>
      </HomeSection>
      <HomeSection section="your-lines">
        <DeferredSection rootMargin="160px 0px">
          <Suspense fallback={null}>
            <YourLines />
          </Suspense>
        </DeferredSection>
      </HomeSection>
    </>
  );
}

export default function HomeContent() {
  const { t } = useTranslation();

  return (
    <>
      <ErrorBoundary
        section="home-region"
        fallback={() => <RegionalContent showRegionPicker={false} />}
      >
        <HomeRegionProvider>
          <RegionalContent />
        </HomeRegionProvider>
      </ErrorBoundary>
      <HomeSection section="intent-map">
        <IntentMap />
      </HomeSection>
      <Band title={t('home.discovery.more')}>
        <ul className="m-0 grid list-none gap-x-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {browseLinks.map(({ to, label }) => (
            <li key={to} className="border-t border-border-hairline">
              <LocalizedLink to={to} className="flex min-h-12 items-center py-2 font-bold">
                {t(label)}
              </LocalizedLink>
            </li>
          ))}
        </ul>
      </Band>
      <SupportBand />
    </>
  );
}
