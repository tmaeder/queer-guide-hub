import { Suspense } from 'react';
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
        {active === 'members' && <UserDirectory />}
        {active === 'friends' && <Friends />}
        {active === 'groups' && <Groups />}
      </Suspense>
    </>
  );
}
