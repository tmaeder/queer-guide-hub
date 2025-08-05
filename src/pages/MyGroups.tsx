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
      <div className="space-y-8 py-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">My Groups</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Please sign in to view your groups
          </p>
          <Button asChild className="bg-gradient-primary hover:opacity-90">
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-slate-950">
            My Groups
          </h1>
          <p className="text-muted-foreground">
            Manage and explore your community groups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
          <Button variant="outline" asChild>
            <Link to="/groups">
              <Users className="h-4 w-4 mr-2" />
              Discover Groups
            </Link>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Groups</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owned</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.ownedGroups}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Member Of</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{stats.memberGroups}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Private</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{stats.privateGroups}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search your groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-48">
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
          <CardContent className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your groups...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? "No groups found" : "You haven't joined any groups yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery 
                ? "Try adjusting your search query" 
                : "Start by joining existing groups or create your own!"
              }
            </p>
            {!searchQuery && (
              <div className="flex justify-center gap-4">
                <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                <Button variant="outline" asChild>
                  <Link to="/groups">Browse Groups</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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