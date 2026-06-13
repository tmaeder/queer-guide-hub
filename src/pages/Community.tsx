import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Rss, UserCheck, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyRetry } from '@/utils/lazyRetry';

// Each tab renders the existing standalone surface. Radix mounts only the active
// tab's content, so a surface's data hooks fire only when its tab is open.
const Feed = lazyRetry(() => import('./Feed'));
const UserDirectory = lazyRetry(() => import('./UserDirectory'));
const Friends = lazyRetry(() => import('./Friends'));
const Groups = lazyRetry(() => import('./Groups'));

const TABS = ['feed', 'members', 'friends', 'groups'] as const;
type CommunityTab = (typeof TABS)[number];

/**
 * Community hub. Folds the four scattered community surfaces — Feed, Members
 * (user directory), Friends, and Groups — under one /community/:tab? home so
 * they stop living as separate top-level routes. Friends is own-only (it holds
 * the friend graph + SOS) and only shows as a tab when signed in; it still
 * self-gates if deep-linked.
 */
export default function Community({ tab }: { tab?: CommunityTab }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();

  const active: CommunityTab = (TABS as readonly string[]).includes(tab ?? '')
    ? (tab as CommunityTab)
    : 'feed';

  const setTab = (v: string) => navigate(v === 'feed' ? '/community' : `/community/${v}`);

  const triggers: ReadonlyArray<readonly [CommunityTab, string, LucideIcon]> = [
    ['feed', t('header.nav.feed', 'Feed'), Rss],
    ['members', t('header.nav.members', 'Members'), UserCheck],
    ...(user
      ? ([['friends', t('header.userMenu.friends', 'Friends'), Users]] as const)
      : []),
    ['groups', t('header.nav.groups', 'Groups'), UsersRound],
  ];

  return (
    <>
      <div className="container mx-auto px-4 pt-6">
        <Tabs value={active} onValueChange={setTab} style={{ width: '100%' }}>
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start overflow-x-auto">
            {triggers.map(([v, label, Icon]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none flex items-center gap-2"
              >
                <Icon size={16} aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Suspense
        fallback={
          <div className="container mx-auto px-4 py-8 flex flex-col gap-4">
            <Skeleton className="h-32 rounded-container" />
            <Skeleton className="h-32 rounded-container" />
          </div>
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
