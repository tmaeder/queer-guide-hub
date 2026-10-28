import React, { Suspense } from 'react';
import { SubwayHero } from '@/components/home/subway/SubwayHero';
import { DeferredSection } from '@/components/home/DeferredSection';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { PageContainer } from '@/components/layout/PageContainer';
import { lazyRetry } from '@/utils/lazyRetry';

const HomeContent = lazyRetry(() => import('@/components/home/HomeContent'));

// Keep a full viewport reserved for the content while its code/data loads.
// The hero and primary navigation never wait for the below-fold bands.
const contentPlaceholder = <div className="min-h-screen" aria-hidden="true" />;

const Index = React.memo(() => (
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
));

Index.displayName = 'Index';
export default Index;
