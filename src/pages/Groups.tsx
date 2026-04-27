import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupCard } from "@/components/groups/GroupCard";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { GroupFilters } from "@/components/groups/GroupFilters";
import { useGroups } from "@/hooks/useGroups";
import { Users, Search, TrendingUp } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { AuthGate } from "@/components/layout/AuthGate";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";import { useTranslation } from 'react-i18next';


export default function Groups() {
  const { t } = useTranslation();
  const {
    groups, userGroups, isLoading,
    createGroup, isCreating,
    joinGroup, isJoining,
    requestJoin, isRequesting,
    leaveGroup, isLeaving,
  } = useGroups();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showMyGroups, setShowMyGroups] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const filteredGroups = useMemo(() => {
    let filtered = showMyGroups ? userGroups : groups;
    if (searchQuery) {
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (selectedTags.length > 0) {
      filtered = filtered.filter(g =>
        g.tags?.length && selectedTags.every(t => g.tags?.includes(t))
      );
    }
    if (activeFilters.length > 0) {
      filtered = filtered.filter(g =>
        activeFilters.every(f => {
          switch (f) {
            case "public": return !g.is_private;
            case "private": return g.is_private;
            case "small": return g.member_count < 50;
            case "medium": return g.member_count >= 50 && g.member_count <= 200;
            case "large": return g.member_count > 200;
            default: return true;
          }
        })
      );
    }
    return filtered;
  }, [groups, userGroups, searchQuery, selectedTags, activeFilters, showMyGroups]);

  const hasActiveFilters =
    !!searchQuery || selectedTags.length > 0 || activeFilters.length > 0;

  const popularGroups = useMemo(
    () => [...groups].filter(g => !g.is_private).sort((a, b) => b.member_count - a.member_count).slice(0, 6),
    [groups]
  );

  return (
    <AuthGate title={t('pages.groups.title', 'Community Groups')} description="Please sign in to view and join community groups.">
      <Container sx={{ py: { xs: 6, md: 10 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <PageHeader
          title={t('pages.groups.title', 'Community Groups')}
          subtitle={t('pages.groups.subtitle', 'Connect with like-minded people, share experiences, and build meaningful relationships in safe and inclusive spaces.')}
          center
          actions={<CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />}
        />

        <Tabs defaultValue="discover" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <TabsTrigger value="discover" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <Search size={16} /> {t('pages.groups.discover', 'Discover')}
            </TabsTrigger>
            <TabsTrigger value="my-groups" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={16} /> {t('pages.groups.myGroups', 'My Groups')} ({userGroups.length})
            </TabsTrigger>
            <TabsTrigger value="popular" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={16} /> {t('pages.groups.popular', 'Popular')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discover" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <GroupFilters
              searchQuery={searchQuery} onSearchChange={setSearchQuery}
              activeFilters={activeFilters} onFilterChange={setActiveFilters}
              showMyGroups={showMyGroups} onShowMyGroupsChange={setShowMyGroups}
              selectedTags={selectedTags} onTagsChange={setSelectedTags}
            />

            {isLoading ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                {Array.from({ length: 6 }).map((_, i) => (<GroupCard key={i} loading />))}
              </Box>
            ) : filteredGroups.length === 0 ? (
              hasActiveFilters ? (
                <EmptyState
                  icon={Search}
                  title={t('pages.groups.noMatchTitle', 'No groups match your search')}
                  description={t('pages.groups.noMatchDescription', 'Try a different keyword or clear your filters.')}
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
                // TODO(polish): primary action is a no-op; wire to CreateGroupDialog open state
                <EmptyState
                  icon={Users}
                  title={t('pages.groups.emptyTitle', 'No groups here yet')}
                  description={t('pages.groups.emptyDescription', 'Be the spark — create the first group and bring people together.')}
                  mood="encouraging"
                  primaryAction={{ label: t('pages.groups.createGroup', 'Create a Group'), onClick: () => {} }}
                />
              )
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                {filteredGroups.map(group => (
                  <GroupCard key={group.id} group={group} onJoin={joinGroup} onRequestJoin={(id) => requestJoin({ groupId: id })} onLeave={leaveGroup} isJoining={isJoining} isRequesting={isRequesting} isLeaving={isLeaving} />
                ))}
              </Box>
            )}
          </TabsContent>

          <TabsContent value="my-groups" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {userGroups.length === 0 ? (
              // TODO(polish): primary action is a no-op; wire to CreateGroupDialog open state
              <EmptyState
                icon={Users}
                title={t('pages.groups.emptyTitle', 'No groups here yet')}
                description={t('pages.groups.emptyDescription', 'Be the spark — create the first group and bring people together.')}
                mood="encouraging"
                primaryAction={{ label: t('pages.groups.createGroup', 'Create a Group'), onClick: () => {} }}
              />
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                {userGroups.map(group => (
                  <GroupCard key={group.id} group={group} onLeave={leaveGroup} isLeaving={isLeaving} />
                ))}
              </Box>
            )}
          </TabsContent>

          <TabsContent value="popular" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={20} />
                  {t('pages.groups.mostPopularGroups', 'Most Popular Groups')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {popularGroups.length === 0 ? (
                  <Typography sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                    {t('pages.groups.noPopularYet', 'No popular groups available yet.')}
                  </Typography>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                    {popularGroups.map(group => (
                      <GroupCard key={group.id} group={group} onJoin={joinGroup} onRequestJoin={(id) => requestJoin({ groupId: id })} onLeave={leaveGroup} isJoining={isJoining} isRequesting={isRequesting} isLeaving={isLeaving} />
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Container>
    </AuthGate>
  );
}
