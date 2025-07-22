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
import { Users, Plus, Search, TrendingUp, Globe, Lock, Sparkles } from "lucide-react";
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

  // Stats
  const stats = useMemo(() => {
    const totalGroups = groups.length;
    const publicGroups = groups.filter(g => !g.is_private).length;
    const privateGroups = groups.filter(g => g.is_private).length;
    const totalMembers = groups.reduce((sum, g) => sum + g.member_count, 0);
    
    return {
      totalGroups,
      publicGroups,
      privateGroups,
      totalMembers,
      myGroups: userGroups.length
    };
  }, [groups, userGroups]);
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
      <div className="text-center space-y-6">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Community Groups
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Connect with like-minded people, share experiences, and build meaningful relationships 
            in safe and inclusive spaces designed for the LGBTQ+ community.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
          {stats.totalGroups > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>Join {stats.totalGroups.toLocaleString()} active groups</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalGroups}</div>
            <div className="text-sm text-muted-foreground">Total Groups</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.publicGroups}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Globe className="h-3 w-3" />
              Public
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{stats.privateGroups}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" />
              Private
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.totalMembers.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-3 w-3" />
              Members
            </div>
          </CardContent>
        </Card>
      </div>
      

      <Tabs defaultValue="discover" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="discover" className="flex items-center gap-2 px-4 py-3">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Discover</span>
          </TabsTrigger>
          <TabsTrigger value="my-groups" className="flex items-center gap-2 px-4 py-3">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">My Groups</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {userGroups.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="popular" className="flex items-center gap-2 px-4 py-3">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Popular</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="space-y-6">
          <GroupFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} activeFilters={activeFilters} onFilterChange={setActiveFilters} showMyGroups={showMyGroups} onShowMyGroupsChange={setShowMyGroups} selectedTags={selectedTags} onTagsChange={setSelectedTags} />

          {isLoading ? (
            <Card className="border-2 border-dashed border-muted">
              <CardContent className="p-8 text-center">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-muted-foreground">Discovering amazing groups...</p>
              </CardContent>
            </Card>
          ) : filteredGroups.length === 0 ? (
            <Card className="border-2 border-dashed border-muted">
              <CardContent className="p-8 text-center space-y-4">
                <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">No groups found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {searchQuery || activeFilters.length > 0 || selectedTags.length > 0
                      ? "Try adjusting your search criteria or explore different tags"
                      : "Be the first to create a group and start building community!"}
                  </p>
                </div>
                {!searchQuery && activeFilters.length === 0 && selectedTags.length === 0 && (
                  <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {filteredGroups.length} group{filteredGroups.length !== 1 ? 's' : ''} found
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Public</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span>Private</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredGroups.map(group => (
                  <GroupCard 
                    key={group.id} 
                    group={group} 
                    onJoin={joinGroup} 
                    onLeave={leaveGroup} 
                    isJoining={isJoining} 
                    isLeaving={isLeaving} 
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-groups" className="space-y-6">
          {userGroups.length === 0 ? (
            <Card className="border-2 border-dashed border-muted">
              <CardContent className="p-8 text-center space-y-4">
                <div className="relative">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground/50" />
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <Plus className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">Start Your Journey</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    You haven't joined any groups yet. Explore our community and find your tribe!
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                  <Button variant="outline" onClick={() => {
                    // Switch to discover tab
                    const discoverTab = document.querySelector('[value="discover"]') as HTMLElement;
                    discoverTab?.click();
                  }}>
                    <Search className="h-4 w-4 mr-2" />
                    Explore Groups
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  You're a member of {userGroups.length} group{userGroups.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {userGroups.map(group => (
                  <GroupCard 
                    key={group.id} 
                    group={group} 
                    onLeave={leaveGroup} 
                    isLeaving={isLeaving} 
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="popular" className="space-y-6">
          <div className="space-y-6">
            <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <TrendingUp className="h-5 w-5" />
                  Trending Groups
                  <Badge variant="secondary" className="ml-2">
                    {popularGroups.length}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Discover the most active and engaging communities
                </p>
              </CardHeader>
            </Card>

            {popularGroups.length === 0 ? (
              <Card className="border-2 border-dashed border-muted">
                <CardContent className="p-8 text-center space-y-4">
                  <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground/50" />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">No trending groups yet</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Be among the first to create popular groups that others will love to join!
                    </p>
                  </div>
                  <CreateGroupDialog onCreateGroup={createGroup} isCreating={isCreating} />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Showing top {popularGroups.length} most popular public groups
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {popularGroups.map((group, index) => (
                    <div key={group.id} className="relative">
                      {index < 3 && (
                        <Badge 
                          className="absolute -top-2 -right-2 z-10 bg-gradient-primary text-primary-foreground"
                        >
                          #{index + 1}
                        </Badge>
                      )}
                      <GroupCard 
                        group={group} 
                        onJoin={joinGroup} 
                        onLeave={leaveGroup} 
                        isJoining={isJoining} 
                        isLeaving={isLeaving} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>;
}