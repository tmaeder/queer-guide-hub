import { Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Band } from '@/components/home/Band';
import { DeferredSection } from '@/components/home/DeferredSection';
import { CityCardsSkeleton } from '@/components/home/subway/CityCardsSkeleton';
import { DeparturesBoard } from '@/components/home/subway/DeparturesBoard';
import { ObservanceBand } from '@/components/home/subway/ObservanceBand';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { PageContainer } from '@/components/layout/PageContainer';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { lazyRetry } from '@/utils/lazyRetry';

const YourLines = lazyRetry(() => import('@/components/home/YourLines'));
const CityCards = lazyRetry(() => import('@/components/home/subway/CityCards'));
const HomeMap = lazyRetry(() => import('@/components/home/subway/HomeMap'));
const cityCardsLoading = <CityCardsSkeleton />;
const mapLoading = (
  <PageContainer aria-hidden="true">
    <div className="h-[420px] rounded-panel bg-muted" />
  </PageContainer>
);
const recommendationsLoading = (
  <div className="h-72 w-56 rounded-container bg-muted" aria-hidden="true" />
);

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

function RegionalContent() {
  const { t } = useTranslation();
  const recent = useRecentlyViewed();

  return (
    <>
      <HomeSection section="departures">
        <DeparturesBoard />
      </HomeSection>
      <HomeSection section="observance">
        <ObservanceBand />
      </HomeSection>
      <HomeSection section="home-map">
        <DeferredSection rootMargin="200px 0px" afterInteraction fallback={mapLoading}>
          <Suspense fallback={mapLoading}>
            <HomeMap />
          </Suspense>
        </DeferredSection>
      </HomeSection>
      <HomeSection section="cities">
        <Band
          surface="tint"
          title={t('home.discovery.destinations', 'Cities, countries and villages')}
          seeAllHref="/travel"
          seeAllLabel={t('home.discovery.allDestinations', 'Travel')}
        >
          <DeferredSection rootMargin="160px 0px" fallback={cityCardsLoading}>
            <Suspense fallback={cityCardsLoading}>
              <CityCards />
            </Suspense>
          </DeferredSection>
        </Band>
      </HomeSection>
      {recent.length > 0 && (
        <Band
          title={t('home.yourLines.title', 'Your lines')}
          description={t('home.yourLines.description', 'Places and things you looked at recently.')}
        >
          {/* Keep the band height stable when the deferred rail gains cards. flow-root
              stops the rail's negative margins collapsing out once it outgrows the
              reservation, which shrank the band 16px and moved the footer. */}
          <div className="flow-root min-h-72">
            <HomeSection section="your-lines">
              <DeferredSection rootMargin="160px 0px" fallback={recommendationsLoading}>
                <Suspense fallback={recommendationsLoading}>
                  <YourLines recent={recent} />
                </Suspense>
              </DeferredSection>
            </HomeSection>
          </div>
        </Band>
      )}
    </>
  );
}

export default function HomeContent() {
  return (
    <>
      <ErrorBoundary section="home-region" fallback={() => <RegionalContent />}>
        <RegionalContent />
      </ErrorBoundary>
    </>
  );
}
