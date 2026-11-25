import { Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { readPeopleContext } from '@/lib/peopleContext';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { PeopleLocationError } from '@/components/people/PeopleDiscoveryState';
import { MeetPageLayout } from '@/components/meet/MeetPageLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';
import { PageContainer } from '@/components/layout/PageContainer';
import { HubNavBar } from '@/components/hub/HubNavBar';
import { MeetNavBar } from '@/components/meet/MeetNav';
import { useMeta } from '@/hooks/useMeta';

// Each route renders one existing standalone surface. Suspense mounts only the
// active page, so its data hooks fire only when that page is open.
const UserDirectory = lazyRetry(() => import('./UserDirectory'));
const Friends = lazyRetry(() => import('./Friends'));
const Groups = lazyRetry(() => import('./Groups'));

const TABS = ['members', 'friends', 'groups'] as const;
type CommunityTab = (typeof TABS)[number];

/**
 * Members and Groups are public discovery (/meet/*, Meet bar); Friends is
 * personal (/hub/friends, Hub bar). The child pages keep their own data and
 * state handling; this wrapper only supplies wayfinding and meta.
 */
export default function Community({ tab }: { tab?: CommunityTab }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const context = readPeopleContext(params);
  const place = useIntentLocation(context.city, { cityId: context.cityId });
  const hasCity = Boolean(context.city || context.cityId);
  const active: CommunityTab = (TABS as readonly string[]).includes(tab ?? '')
    ? (tab as CommunityTab)
    : 'members';

  const meta = {
    members: {
      title: 'Browse LGBTQ+ community members',
      description: 'Browse members by their shared interests, pronouns and cities.',
    },
    friends: {
      title: 'Friends',
      description: 'Manage friends, requests and new connections.',
    },
    groups: {
      title: 'LGBTQ+ groups to join',
      description: 'Find local and interest-based queer groups and manage the groups you joined.',
    },
  }[active];

  useMeta({
    ...meta,
    canonicalPath: active === 'friends' ? '/hub/friends' : `/meet/${active}`,
    noIndex: active === 'friends',
  });

  if (active === 'members')
    return (
      <MeetPageLayout
        title={t('header.nav.people', 'People')}
        description={t(
          'meetConsolidation.pages.people',
          'Browse members or find friends, travel buddies and people nearby.',
        )}
      >
        <Suspense fallback={<Skeleton className="h-32" />}>
          {hasCity && place.loading ? (
            <Skeleton className="h-32" />
          ) : hasCity && place.error ? (
            <PeopleLocationError retry={place.retry} />
          ) : (
            <UserDirectory
              key={hasCity ? place.cityId : 'global'}
              embedded
              initialLocation={hasCity ? (place.cityName ?? undefined) : undefined}
            />
          )}
        </Suspense>
      </MeetPageLayout>
    );

  return (
    <>
      {active === 'friends' ? <HubNavBar /> : <MeetNavBar />}

      <Suspense
        fallback={
          <PageContainer className="flex flex-col gap-4">
            <Skeleton className="h-32 rounded-container" />
            <Skeleton className="h-32 rounded-container" />
          </PageContainer>
        }
      >
        {active === 'friends' && <Friends />}
        {active === 'groups' && <Groups />}
      </Suspense>
    </>
  );
}
