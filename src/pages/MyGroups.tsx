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
      <div sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
        <div sx={{ textAlign: 'center' }}>
          <h1 sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 2 }}>My Groups</h1>
          <p sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 4 }}>
            Please sign in to view your groups
          </p>
          <Button asChild sx={{ background: 'var(--gradient-primary)', '&:hover': { opacity: 0.9 } }}>
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 4 }}>
      {/* Header */}
      <div sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, gap: 2 }}>
        <div>
          <h1 sx={{ fontSize: '2.25rem', fontWeight: 700, mb: 1, backgroundImage: 'var(--gradient-primary)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: '#020617' }}>
            My Groups
          </h1>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Manage and explore your community groups
          </p>
        </div>
        <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
          <Button variant="outline" asChild>
            <Link to="/groups">
              <Users style={{ height: 16, width: 16, marginRight: 8 }} />
              Discover Groups
            </Link>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Total Groups</CardTitle>
          </CardHeader>
          <CardContent sx={{ pt: 0 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Users style={{ height: 16, width: 16, color: 'var(--primary)' }} />
              <span sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Owned</CardTitle>
          </CardHeader>
          <CardContent sx={{ pt: 0 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Crown style={{ height: 16, width: 16, color: '#eab308' }} />
              <span sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.ownedGroups}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Member Of</CardTitle>
          </CardHeader>
          <CardContent sx={{ pt: 0 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UserCheck style={{ height: 16, width: 16, color: '#22c55e' }} />
              <span sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.memberGroups}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Private</CardTitle>
          </CardHeader>
          <CardContent sx={{ pt: 0 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Settings style={{ height: 16, width: 16, color: '#3b82f6' }} />
              <span sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.privateGroups}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Sort Controls */}
      <div sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <div sx={{ flex: 1 }}>
          <Input
            placeholder="Search your groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ width: '100%' }}
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger sx={{ width: { xs: '100%', sm: 192 } }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="members">Most Members</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Groups Grid */}
      {isLoading ? (
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <div sx={{ animation: 'spin 1s linear infinite', height: 32, width: 32, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%', mx: 'auto', mb: 2 }} />
            <p style={{ color: 'var(--muted-foreground)' }}>Loading your groups...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedGroups.length === 0 ? (
        <Card>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Users style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
            <h3 sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>
              {searchQuery ? "No groups found" : "You haven't joined any groups yet"}
            </h3>
            <p sx={{ color: 'text.secondary', mb: 2 }}>
              {searchQuery 
                ? "Try adjusting your search query" 
                : "Start by joining existing groups or create your own!"
              }
            </p>
            {!searchQuery && (
              <div sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                <Button variant="outline" asChild>
                  <Link to="/groups">Browse Groups</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {filteredAndSortedGroups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              onLeave={leaveGroup}
              isLeaving={isLeaving}
            />
          ))}
        </div>
      )}
    </div>
  );
}