import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { GroupCard } from "@/components/groups/GroupCard";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { GroupFilters } from "@/components/groups/GroupFilters";
import { useGroups, Group } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { Users, Plus, Search, TrendingUp } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function Groups() {
  const {
    user
  } = useAuth();
  const {
    groups,
    userGroups,
    isLoading,
    createGroup,
    isCreating,
    joinGroup,
    isJoining,
    leaveGroup,
    isLeaving
  } = useGroups();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showMyGroups, setShowMyGroups] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Filter groups based on search and filters
  const filteredGroups = useMemo(() => {
    let filtered = showMyGroups ? userGroups : groups;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(group => group.name.toLowerCase().includes(searchQuery.toLowerCase()) || group.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(group => {
        if (!group.tags || group.tags.length === 0) return false;
        return selectedTags.every(tag => group.tags?.includes(tag));
      });
    }

    // Category filters
    if (activeFilters.length > 0) {
      filtered = filtered.filter(group => {
        return activeFilters.every(filter => {
          switch (filter) {
            case "public":
              return !group.is_private;
            case "private":
              return group.is_private;
            case "small":
              return group.member_count < 50;
            case "medium":
              return group.member_count >= 50 && group.member_count <= 200;
            case "large":
              return group.member_count > 200;
            default:
              return true;
          }
        });
      });
    }
    return filtered;
  }, [groups, userGroups, searchQuery, selectedTags, activeFilters, showMyGroups]);

  // Popular groups (sorted by member count)
  const popularGroups = useMemo(() => [...groups].filter(g => !g.is_private).sort((a, b) => b.member_count - a.member_count).slice(0, 6), [groups]);
  if (!user) {
    return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h3" component="h1" sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 2 }}>Community Groups</Typography>
          <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 4 }}>
            Please sign in to view and join community groups
          </Typography>
          <Button asChild style={{ background: 'var(--gradient-primary)' }}>
            <a href="/auth">Sign In</a>
          </Button>
        </Box>
      </Box>;
  }
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h3" component="h1" sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 2, color: 'text.primary' }}>
          Community Groups
        </Typography>
        <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 4, maxWidth: 672, mx: 'auto' }}>
          Connect with like-minded people, share experiences, and build meaningful relationships
          in safe and inclusive spaces.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
        </Box>
      </Box>

      {/* Stats */}


      <Tabs defaultValue="discover" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <TabsTrigger value="discover" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, textAlign: 'right' }}>
            <Search style={{ height: 16, width: 16 }} />
            Discover
          </TabsTrigger>
          <TabsTrigger value="my-groups" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users style={{ height: 16, width: 16 }} />
            My Groups ({userGroups.length})
          </TabsTrigger>
          <TabsTrigger value="popular" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp style={{ height: 16, width: 16 }} />
            Popular
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <GroupFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} activeFilters={activeFilters} onFilterChange={setActiveFilters} showMyGroups={showMyGroups} onShowMyGroupsChange={setShowMyGroups} selectedTags={selectedTags} onTagsChange={setSelectedTags} />

          {isLoading ? <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <Box sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, bgcolor: 'primary.main', borderRadius: 2, mx: 'auto', mb: 2 }} />
                <p style={{ color: '#999999' }}>Loading groups...</p>
              </CardContent>
            </Card> : filteredGroups.length === 0 ? <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <Users style={{ height: 48, width: 48, margin: '0 auto 16px', color: '#999999' }} />
                <Typography variant="h6" component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No groups found</Typography>
                <Typography sx={{ color: 'text.secondary', mb: 2 }}>
                  {searchQuery || activeFilters.length > 0 ? "Try adjusting your search or filters" : "Be the first to create a group in this community!"}
                </Typography>
                {!searchQuery && activeFilters.length === 0 && <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />}
              </CardContent>
            </Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
              {filteredGroups.map(group => <GroupCard key={group.id} group={group} onJoin={joinGroup} onLeave={leaveGroup} isJoining={isJoining} isLeaving={isLeaving} />)}
            </Box>}
        </TabsContent>

        <TabsContent value="my-groups" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {userGroups.length === 0 ? <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <Users style={{ height: 48, width: 48, margin: '0 auto 16px', color: '#999999' }} />
                <Typography variant="h6" component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>You haven't joined any groups yet</Typography>
                <Typography sx={{ color: 'text.secondary', mb: 2 }}>
                  Start by joining existing groups or create your own!
                </Typography>
                <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
              </CardContent>
            </Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
              {userGroups.map(group => <GroupCard key={group.id} group={group} onLeave={leaveGroup} isLeaving={isLeaving} />)}
            </Box>}
        </TabsContent>

        <TabsContent value="popular" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp style={{ height: 20, width: 20 }} />
                Most Popular Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {popularGroups.length === 0 ? <Typography sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}>
                  No popular groups available yet.
                </Typography> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                  {popularGroups.map(group => <GroupCard key={group.id} group={group} onJoin={joinGroup} onLeave={leaveGroup} isJoining={isJoining} isLeaving={isLeaving} />)}
                </Box>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Box>;
}
