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

  // Filter groups based on search and filters
  const filteredGroups = useMemo(() => {
    let filtered = showMyGroups ? userGroups : groups;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(group => group.name.toLowerCase().includes(searchQuery.toLowerCase()) || group.description?.toLowerCase().includes(searchQuery.toLowerCase()));
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
  }, [groups, userGroups, searchQuery, activeFilters, showMyGroups]);

  // Popular groups (sorted by member count)
  const popularGroups = useMemo(() => [...groups].filter(g => !g.is_private).sort((a, b) => b.member_count - a.member_count).slice(0, 6), [groups]);
  if (!user) {
    return <div className="space-y-8 py-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Community Groups</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Please sign in to view and join community groups
          </p>
          <Button asChild className="bg-gradient-primary hover:opacity-90">
            <a href="/auth">Sign In</a>
          </Button>
        </div>
      </div>;
  }
  return <div className="space-y-8 py-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
          Community Groups
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Connect with like-minded people, share experiences, and build meaningful relationships 
          in safe and inclusive spaces.
        </p>
        <div className="flex justify-center gap-4 mb-8">
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
        </div>
      </div>

      {/* Stats */}
      

      <Tabs defaultValue="discover" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="discover" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="my-groups" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            My Groups ({userGroups.length})
          </TabsTrigger>
          <TabsTrigger value="popular" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Popular
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-6">
          <GroupFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} activeFilters={activeFilters} onFilterChange={setActiveFilters} showMyGroups={showMyGroups} onShowMyGroupsChange={setShowMyGroups} />

          {isLoading ? <Card>
              <CardContent className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-muted-foreground">Loading groups...</p>
              </CardContent>
            </Card> : filteredGroups.length === 0 ? <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No groups found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || activeFilters.length > 0 ? "Try adjusting your search or filters" : "Be the first to create a group in this community!"}
                </p>
                {!searchQuery && activeFilters.length === 0 && <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />}
              </CardContent>
            </Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGroups.map(group => <GroupCard key={group.id} group={group} onJoin={joinGroup} onLeave={leaveGroup} isJoining={isJoining} isLeaving={isLeaving} />)}
            </div>}
        </TabsContent>

        <TabsContent value="my-groups" className="space-y-6">
          {userGroups.length === 0 ? <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">You haven't joined any groups yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by joining existing groups or create your own!
                </p>
                <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
              </CardContent>
            </Card> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userGroups.map(group => <GroupCard key={group.id} group={group} onLeave={leaveGroup} isLeaving={isLeaving} />)}
            </div>}
        </TabsContent>

        <TabsContent value="popular" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Most Popular Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {popularGroups.length === 0 ? <p className="text-center text-muted-foreground py-8">
                  No popular groups available yet.
                </p> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {popularGroups.map(group => <GroupCard key={group.id} group={group} onJoin={joinGroup} onLeave={leaveGroup} isJoining={isJoining} isLeaving={isLeaving} />)}
                </div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>;
}