import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GroupCard } from '@/components/groups/GroupCard';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';
import { GroupFilters } from '@/components/groups/GroupFilters';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Users, Search, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';

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
  // /my-groups redirects here with ?tab=mine — land on the My Groups tab.
  const initialTab = searchParams.get('tab') === 'mine' && user ? 'my-groups' : 'discover';
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

  const popularGroups = useMemo(
    () =>
      [...groups]
        .filter((g) => !g.is_private)
        .sort((a, b) => b.member_count - a.member_count)
        .slice(0, 6),
    [groups],
  );

  return (
    <div className="container mx-auto py-12 md:py-20 px-4 flex flex-col gap-6 relative">
      <PageHeader
        title={t('pages.groups.title', 'Community Groups')}
        subtitle={t(
          'pages.groups.subtitle',
          'Connect with like-minded people, share experiences, and build meaningful relationships in safe and inclusive spaces.',
        )}
        center
        actions={
          user ? (
            <CreateGroupDialog
              onCreateGroup={createGroup}
              isCreating={isCreating}
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
          ) : undefined
        }
      />

      <Tabs
        defaultValue={initialTab}
        style={{ flexDirection: 'column', gap: '1.5rem' }}
        className="flex"
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

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <GroupCard key={i} loading />
                  ))}
                </div>
              ) : filteredGroups.length === 0 ? (
                hasActiveFilters ? (
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
                )
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </div>
  );
}
