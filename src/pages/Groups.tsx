import { useState, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GroupCard } from '@/components/groups/GroupCard';
import { GroupInvitationReview } from '@/components/groups/GroupInvitationReview';
import { GroupDiscoveryRail } from '@/components/groups/GroupDiscoveryRail';
import { GroupDiscoveryOpening } from '@/components/groups/GroupDiscoveryOpening';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';
import { GroupFilters } from '@/components/groups/GroupFilters';
import { useGroups } from '@/hooks/useGroups';
import { useRecommendedGroups } from '@/hooks/useRecommendedGroups';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ArrowDown, Users, Search, TrendingUp, Sparkles, Star } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';

export default function Groups() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const {
    groups,
    userGroups,
    isLoading,
    createGroup,
    isCreating,
    joinGroup,
    isJoining,
    requestJoin,
    isRequesting,
    leaveGroup,
    isLeaving,
  } = useGroups();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  // /my-groups redirects here with ?tab=mine — land on the My Groups tab.
  const mine = searchParams.get('tab') === 'mine' && !!user;
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const activeTab =
    (selectedTab === 'my-groups' && !user ? null : selectedTab) ??
    (mine ? 'my-groups' : 'discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showMyGroups, setShowMyGroups] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const filteredGroups = useMemo(() => {
    let filtered = showMyGroups ? userGroups : groups;
    if (searchQuery) {
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (selectedTags.length > 0) {
      filtered = filtered.filter(
        (g) => g.tags?.length && selectedTags.every((t) => g.tags?.includes(t)),
      );
    }
    if (activeFilters.length > 0) {
      filtered = filtered.filter((g) =>
        activeFilters.every((f) => {
          switch (f) {
            case 'public':
              return !g.is_private;
            case 'private':
              return g.is_private;
            case 'small':
              return g.member_count < 50;
            case 'medium':
              return g.member_count >= 50 && g.member_count <= 200;
            case 'large':
              return g.member_count > 200;
            default:
              return true;
          }
        }),
      );
    }
    return filtered;
  }, [groups, userGroups, searchQuery, selectedTags, activeFilters, showMyGroups]);

  const hasActiveFilters = !!searchQuery || selectedTags.length > 0 || activeFilters.length > 0;

  const {
    groups: recommendedGroups,
    isLoading: recsLoading,
    isEmpty: recsEmpty,
  } = useRecommendedGroups(12);

  const featuredGroups = useMemo(
    () => groups.filter((g) => g.featured && !g.is_private).slice(0, 12),
    [groups],
  );

  const groupsByActivity = useMemo(
    () =>
      [...groups]
        .filter((g) => !g.is_private && !g.archived_at)
        .sort(
          (a, b) =>
            new Date(b.last_activity_at ?? b.created_at).getTime() -
            new Date(a.last_activity_at ?? a.created_at).getTime(),
        ),
    [groups],
  );

  const [recentCutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentGroups = groupsByActivity.filter(
    (group) => Date.parse(group.last_activity_at ?? group.created_at) >= recentCutoff,
  );

  const popularGroups = useMemo(
    () =>
      [...groups]
        .filter((g) => !g.is_private && !g.archived_at)
        .sort((a, b) => b.member_count - a.member_count)
        .slice(0, 6),
    [groups],
  );

  const openingGroups = (recentGroups.length > 0 ? recentGroups : popularGroups).slice(0, 2);

  const railHandlers = {
    isAuthenticated: !!user,
    onJoin: joinGroup,
    onRequestJoin: (id: string) => requestJoin({ groupId: id }),
    onLeave: leaveGroup,
    isJoining,
    isRequesting,
    isLeaving,
  };

  return (
    <PageContainer flush className="relative flex flex-col gap-6 pb-8 pt-4 md:pb-12">
      <header className="grid gap-4">
        <div>
          <h1 className="font-display text-headline leading-tight tracking-tight md:text-display">
            {t('pages.groups.title', 'Community Groups')}
          </h1>
          <p className="mt-2 max-w-reading text-pretty text-muted-foreground">
            {t(
              'pages.groups.opening.subtitle',
              'Find a queer group, show up to a meetup, or start something of your own.',
            )}
          </p>
        </div>
        {!mine && (
          <GroupDiscoveryOpening
            groups={openingGroups}
            groupsLoading={isLoading}
            recentlyActive={recentGroups.length > 0}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!mine && (
            <Button asChild variant="soft">
              <a href="#group-directory">
                <ArrowDown size={16} aria-hidden="true" />
                {t('pages.groups.opening.browse', 'Browse groups')}
              </a>
            </Button>
          )}
          {user ? (
            <CreateGroupDialog
              onCreateGroup={createGroup}
              isCreating={isCreating}
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
          ) : (
            <Button asChild variant="ghost">
              <LocalizedLink to={`/auth?redirect=${encodeURIComponent(pathname)}`}>
                {t('pages.groups.opening.signIn', 'Sign in to join')}
              </LocalizedLink>
            </Button>
          )}
        </div>
      </header>
      <GroupInvitationReview />

      <Tabs
        id="group-directory"
        tabIndex={-1}
        value={activeTab}
        onValueChange={setSelectedTab}
        className="flex scroll-mt-28 flex-col gap-6"
      >
        <TabsList
          style={{ width: '100%', gridTemplateColumns: user ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)' }}
          className="grid"
        >
          <TabsTrigger
            value="discover"
            style={{ alignItems: 'center', gap: '0.5rem' }}
            className="flex font-bold"
          >
            <Search size={16} /> {t('pages.groups.discover', 'Find groups')}
          </TabsTrigger>
          {user && (
            <TabsTrigger
              value="my-groups"
              style={{ alignItems: 'center', gap: '0.5rem' }}
              className="flex"
            >
              <Users size={16} /> {t('pages.groups.myGroups', 'My Groups')} ({userGroups.length})
            </TabsTrigger>
          )}
          <TabsTrigger
            value="popular"
            style={{ alignItems: 'center', gap: '0.5rem' }}
            className="flex"
          >
            <TrendingUp size={16} /> {t('pages.groups.popular', 'Popular')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="discover"
          style={{ flexDirection: 'column', gap: '1.5rem' }}
          className="flex"
        >
          <GroupFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
            showMyGroups={showMyGroups}
            onShowMyGroupsChange={setShowMyGroups}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />

          {hasActiveFilters ? (
            isLoading ? (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <GroupCard key={i} loading />
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('pages.groups.noMatchTitle', 'No groups match your search')}
                description={t(
                  'pages.groups.noMatchDescription',
                  'Try a different keyword or clear your filters.',
                )}
                mood="neutral"
                primaryAction={{
                  label: t('pages.groups.clearFilters', 'Clear filters'),
                  onClick: () => {
                    setSearchQuery('');
                    setActiveFilters([]);
                    setSelectedTags([]);
                  },
                }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredGroups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    isAuthenticated={!!user}
                    onJoin={joinGroup}
                    onRequestJoin={(id) => requestJoin({ groupId: id })}
                    onLeave={leaveGroup}
                    isJoining={isJoining}
                    isRequesting={isRequesting}
                    isLeaving={isLeaving}
                  />
                ))}
              </div>
            )
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <GroupCard key={i} loading />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('pages.groups.emptyTitle', 'No groups here yet')}
              description={t(
                'pages.groups.emptyDescription',
                'Be the spark — create the first group and bring people together.',
              )}
              mood="encouraging"
              primaryAction={
                user
                  ? {
                      label: t('pages.groups.createGroup', 'Create a Group'),
                      onClick: () => setCreateOpen(true),
                    }
                  : {
                      label: t('common.signIn', 'Sign in'),
                      onClick: () => navigate('/auth'),
                    }
              }
            />
          ) : (
            <>
              {user && (
                <GroupDiscoveryRail
                  title={t('pages.groups.forYou', 'For you')}
                  icon={Sparkles}
                  groups={recommendedGroups}
                  loading={recsLoading}
                  {...railHandlers}
                  emptyState={
                    recsEmpty ? (
                      <EmptyState
                        icon={Sparkles}
                        title={t('pages.groups.forYouEmptyTitle', 'Nothing tailored yet')}
                        description={t(
                          'pages.groups.forYouEmptyDescription',
                          "Join a group or two and we'll start finding your people.",
                        )}
                        mood="encouraging"
                      />
                    ) : undefined
                  }
                />
              )}

              {featuredGroups.length > 0 && (
                <GroupDiscoveryRail
                  title={t('pages.groups.featured', 'Featured')}
                  icon={Star}
                  groups={featuredGroups}
                  {...railHandlers}
                />
              )}

              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-foreground" />
                  {t('pages.groups.allGroups', 'All groups')}
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {groups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      isAuthenticated={!!user}
                      onJoin={joinGroup}
                      onRequestJoin={(id) => requestJoin({ groupId: id })}
                      onLeave={leaveGroup}
                      isJoining={isJoining}
                      isRequesting={isRequesting}
                      isLeaving={isLeaving}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent
          value="my-groups"
          style={{ flexDirection: 'column', gap: '1.5rem' }}
          className="flex"
        >
          {userGroups.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t('pages.groups.emptyTitle', 'No groups here yet')}
              description={t(
                'pages.groups.emptyDescription',
                'Be the spark — create the first group and bring people together.',
              )}
              mood="encouraging"
              primaryAction={{
                label: t('pages.groups.createGroup', 'Create a Group'),
                onClick: () => setCreateOpen(true),
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {userGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onLeave={leaveGroup}
                  isLeaving={isLeaving}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="popular"
          style={{ flexDirection: 'column', gap: '1.5rem' }}
          className="flex"
        >
          <Card>
            <CardHeader>
              <CardTitle style={{ alignItems: 'center', gap: '0.5rem' }} className="flex">
                <TrendingUp size={20} />
                {t('pages.groups.mostPopularGroups', 'Most Popular Groups')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {popularGroups.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {t('pages.groups.noPopularYet', 'No popular groups available yet.')}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {popularGroups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      isAuthenticated={!!user}
                      onJoin={joinGroup}
                      onRequestJoin={(id) => requestJoin({ groupId: id })}
                      onLeave={leaveGroup}
                      isJoining={isJoining}
                      isRequesting={isRequesting}
                      isLeaving={isLeaving}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
