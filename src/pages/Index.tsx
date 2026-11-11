import React, { Suspense } from 'react';
import { SubwayHero } from '@/components/home/subway/SubwayHero';
import { DeferredSection } from '@/components/home/DeferredSection';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { HomeRegionProvider } from '@/components/home/HomeRegionProvider';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { PageContainer } from '@/components/layout/PageContainer';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';

const HomeContent = lazyRetry(() => import('@/components/home/HomeContent'));

// Reserve the shape of the first listings section while its chunk loads.
const contentPlaceholder = (
  <PageContainer aria-hidden="true">
    <Skeleton className="mb-6 h-10 w-2/3 max-w-80" />
    <div className="divide-y divide-border-hairline rounded-container bg-card">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex h-[74px] items-center gap-4 px-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-2/5" />
        </div>
      ))}
    </div>
  </PageContainer>
);

const Index = React.memo(() => (
  // Region wraps the hero too, so the featured city matches the bands below.
  <HomeRegionProvider>
    <div className="min-h-screen">
      <SubwayHero />
      <ErrorBoundary
        section="home-content"
        fallback={({ onRetry }) => (
          <PageContainer>
            <HomeSectionError onRetry={onRetry} />
          </PageContainer>
        )}
      >
        <DeferredSection rootMargin="200px 0px" fallback={contentPlaceholder}>
          <Suspense fallback={contentPlaceholder}>
            <HomeContent />
          </Suspense>
        </DeferredSection>
      </ErrorBoundary>
    </div>
  </HomeRegionProvider>
));

Index.displayName = 'Index';
export default Index;
