import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GroupCard } from '@/components/groups/GroupCard';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';
import { Users, Crown, UserCheck, Settings, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState } from '@/components/ui/EmptyState';

export default function MyGroups() {
  const { userGroups, isLoading, createGroup, isCreating, leaveGroup, isLeaving } = useGroups();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  // Filter and sort user's groups
  const filteredAndSortedGroups = useMemo(() => {
    let filtered = userGroups;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (group) =>
          group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          group.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Sort groups
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'members':
          return b.member_count - a.member_count;
        case 'recent':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [userGroups, searchQuery, sortBy]);

  // Group statistics
  const stats = useMemo(() => {
    const total = userGroups.length;
    const ownedGroups = userGroups.filter((group) => group.created_by === user?.id).length;
    const memberGroups = total - ownedGroups;
    const privateGroups = userGroups.filter((group) => group.is_private).length;

    return { total, ownedGroups, memberGroups, privateGroups };
  }, [userGroups, user?.id]);

  return (
    <AuthGate title="My Groups" description="Please sign in to view your groups">
      <Container sx={{ py: 4 }}>
        {/* Header */}
        <PageHeader
          title="My Groups"
          subtitle="Manage and explore your community groups"
          actions={
            <>
              <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
              <Button variant="outline" asChild>
                <Link to="/groups">
                  <Users style={{ height: 16, width: 16, marginRight: 8 }} />
                  Discover Groups
                </Link>
              </Button>
            </>
          }
        />

        {/* Statistics Cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Total Groups
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users style={{ height: 16, width: 16 }} />
                <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {stats.total}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Owned
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Crown style={{ height: 16, width: 16, color: '#eab308' }} />
                <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {stats.ownedGroups}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Member Of
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <UserCheck style={{ height: 16, width: 16, color: '#22c55e' }} />
                <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {stats.memberGroups}
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ paddingBottom: '8px' }}>
              <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>
                Private
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Settings style={{ height: 16, width: 16, color: '#3b82f6' }} />
                <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {stats.privateGroups}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Search and Sort Controls */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Input
              placeholder="Search your groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </Box>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger style={{ width: 192 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Most Recent</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="members">Most Members</SelectItem>
            </SelectContent>
          </Select>
        </Box>

        {/* Groups Grid */}
        {isLoading ? (
          <PageLoadingState count={6} />
        ) : filteredAndSortedGroups.length === 0 ? (
          searchQuery ? (
            <EmptyState
              icon={Search}
              title="You haven't joined any groups yet"
              description="Explore groups and find your people."
              mood="encouraging"
            />
          ) : (
            <Card>
              <CardContent sx={{ p: 6, textAlign: 'center' }}>
                <Users
                  style={{
                    width: 48,
                    height: 48,
                    margin: '0 auto 16px',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  You haven't joined any groups yet
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 3, maxWidth: '28rem', mx: 'auto' }}
                >
                  Start by joining existing groups or create your own!
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                  <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                  <Button variant="outline" asChild>
                    <Link to="/groups">Browse Groups</Link>
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: 3,
            }}
          >
            {filteredAndSortedGroups.map((group) => (
              <GroupCard key={group.id} group={group} onLeave={leaveGroup} isLeaving={isLeaving} />
            ))}
          </Box>
        )}
      </Container>
    </AuthGate>
  );
}
