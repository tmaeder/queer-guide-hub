import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';
import { PageContainer } from '@/components/layout/PageContainer';
import { PeopleNav } from '@/components/people/PeopleNav';
import { useMeta } from '@/hooks/useMeta';

// Each tab renders the existing standalone surface. Radix mounts only the active
// tab's content, so a surface's data hooks fire only when its tab is open.
const Feed = lazyRetry(() => import('./Feed'));
const UserDirectory = lazyRetry(() => import('./UserDirectory'));
const Friends = lazyRetry(() => import('./Friends'));
const Groups = lazyRetry(() => import('./Groups'));

const TABS = ['feed', 'members', 'friends', 'groups'] as const;
type CommunityTab = (typeof TABS)[number];

/**
 * Community views inside the canonical /people area. The child pages retain
 * their established data and state handling; this wrapper supplies one shared
 * wayfinding system instead of a second, competing Community tab bar.
 */
export default function Community({ tab }: { tab?: CommunityTab }) {
  const active: CommunityTab = (TABS as readonly string[]).includes(tab ?? '')
    ? (tab as CommunityTab)
    : 'feed';

  const meta = {
    feed: {
      title: 'Community feed',
      description: 'Recommendations, questions, meet-ups and news shared by Queer Guide members.',
    },
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
    canonicalPath: `/people/${active}`,
    noIndex: active === 'friends',
  });

  return (
    <>
      <PageContainer className="pb-0 pt-6 md:pt-8">
        <PeopleNav />
      </PageContainer>

      <Suspense
        fallback={
          <PageContainer className="flex flex-col gap-4">
            <Skeleton className="h-32 rounded-container" />
            <Skeleton className="h-32 rounded-container" />
          </PageContainer>
        }
      >
        {active === 'feed' && <Feed />}
        {active === 'members' && <UserDirectory />}
        {active === 'friends' && <Friends />}
        {active === 'groups' && <Groups />}
      </Suspense>
    </>
  );
}
