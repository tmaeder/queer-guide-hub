import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { Band } from '@/components/home/Band';
import { CityCards } from '@/components/home/subway/CityCards';
import { DeparturesBoard } from '@/components/home/subway/DeparturesBoard';
import { HomeRegionProvider } from '@/components/home/HomeRegionProvider';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { SupportBand } from '@/components/home/subway/SupportBand';
import { YourLines } from '@/components/home/YourLines';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

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
  return (
    <>
      <HomeSection section="departures">
        <DeparturesBoard showRegionPicker={showRegionPicker} />
      </HomeSection>
      <HomeSection section="cities">
        <CityCards />
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
      <HomeSection section="your-lines">
        <YourLines />
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
