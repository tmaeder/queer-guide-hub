import { Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Band } from '@/components/home/Band';
import { DeferredSection } from '@/components/home/DeferredSection';
import { CityCardsSkeleton } from '@/components/home/subway/CityCardsSkeleton';
import { DeparturesBoard } from '@/components/home/subway/DeparturesBoard';
import { HomeRegionProvider } from '@/components/home/HomeRegionProvider';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { IntentMap } from '@/components/home/subway/IntentMap';
import { PageContainer } from '@/components/layout/PageContainer';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { lazyRetry } from '@/utils/lazyRetry';

const YourLines = lazyRetry(() => import('@/components/home/YourLines'));
const CityCards = lazyRetry(() => import('@/components/home/subway/CityCards'));
const cityCardsLoading = <CityCardsSkeleton />;
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

function RegionalContent({ showRegionPicker = true }: { showRegionPicker?: boolean }) {
  const { t } = useTranslation();
  const recent = useRecentlyViewed();

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
      {recent.length > 0 && (
        <Band
          title={t('home.yourLines.title', 'Your lines')}
          description={t('home.yourLines.description', 'Places and things you looked at recently.')}
        >
          {/* Keep the map position stable when the deferred rail gains cards. */}
          <div className="h-72 overflow-y-auto">
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
    </>
  );
}
