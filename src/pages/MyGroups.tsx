import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroupCard } from "@/components/groups/GroupCard";
import { CreateGroupDialog } from "@/components/groups/CreateGroupDialog";
import { useGroups } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { Users, Plus, Crown, UserCheck, Clock, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function MyGroups() {
  const { user } = useAuth();
  const {
    userGroups,
    isLoading,
    createGroup,
    isCreating,
    leaveGroup,
    isLeaving
  } = useGroups();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");

  // Filter and sort user's groups
  const filteredAndSortedGroups = useMemo(() => {
    let filtered = userGroups;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(group =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort groups
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "members":
          return b.member_count - a.member_count;
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [userGroups, searchQuery, sortBy]);

  // Group statistics
  const stats = useMemo(() => {
    const total = userGroups.length;
    const ownedGroups = userGroups.filter(group => group.created_by === user?.id).length;
    const memberGroups = total - ownedGroups;
    const privateGroups = userGroups.filter(group => group.is_private).length;

    return { total, ownedGroups, memberGroups, privateGroups };
  }, [userGroups, user?.id]);

  if (!user) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h3" component="h1" sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 2 }}>My Groups</Typography>
          <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 4 }}>
            Please sign in to view your groups
          </Typography>
          <Button asChild style={{ background: 'var(--gradient-primary)' }}>
            <Link to="/auth">Sign In</Link>
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, gap: 2 }}>
        <div>
          <Typography variant="h3" component="h1" sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 1, color: '#020617' }}>
            My Groups
          </Typography>
          <p style={{ color: '#999999' }}>
            Manage and explore your community groups
          </p>
        </div>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
          <Button variant="outline" asChild>
            <Link to="/groups">
              <Users style={{ height: 16, width: 16, marginRight: 8 }} />
              Discover Groups
            </Link>
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader style={{ paddingBottom: '8px' }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>Total Groups</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Users style={{ height: 16, width: 16, color: '#333333' }} />
              <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: '8px' }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>Owned</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Crown style={{ height: 16, width: 16, color: '#eab308' }} />
              <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.ownedGroups}</Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: '8px' }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>Member Of</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UserCheck style={{ height: 16, width: 16, color: '#22c55e' }} />
              <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.memberGroups}</Box>
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ paddingBottom: '8px' }}>
            <CardTitle style={{ fontSize: '0.875rem', fontWeight: 500, color: '#666' }}>Private</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Settings style={{ height: 16, width: 16, color: '#3b82f6' }} />
              <Box component="span" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.privateGroups}</Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Search and Sort Controls */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
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
        <Card>
          <CardContent style={{ padding: '32px', textAlign: 'center' }}>
            <Box sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', mx: 'auto', mb: 2 }} />
            <p style={{ color: '#999999' }}>Loading your groups...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedGroups.length === 0 ? (
        <Card>
          <CardContent style={{ padding: '32px', textAlign: 'center' }}>
            <Users style={{ height: 48, width: 48, margin: '0 auto 16px', color: '#999999' }} />
            <Typography variant="h6" component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>
              {searchQuery ? "No groups found" : "You haven't joined any groups yet"}
            </Typography>
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>
              {searchQuery
                ? "Try adjusting your search query"
                : "Start by joining existing groups or create your own!"
              }
            </Typography>
            {!searchQuery && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                <Button variant="outline" asChild>
                  <Link to="/groups">Browse Groups</Link>
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {filteredAndSortedGroups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onLeave={leaveGroup}
              isLeaving={isLeaving}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
