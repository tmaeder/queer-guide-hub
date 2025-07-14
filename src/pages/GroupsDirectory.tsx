import React, { useState } from "react";
import { useGroups } from "@/hooks/useGroups";
import { useAuth } from "@/hooks/useAuth";
import { GroupCard } from "@/components/community/GroupCard";
import { CreateGroup } from "@/components/community/CreateGroup";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Users, Plus, Globe, Lock, Star } from "lucide-react";

const GroupsDirectory = () => {
  const { user } = useAuth();
  const { groups, myGroups, loading, error } = useGroups();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const filteredGroups = groups.filter(group => 
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const publicGroups = filteredGroups.filter(group => !group.is_private);
  const privateGroups = filteredGroups.filter(group => group.is_private);
  const featuredGroups = filteredGroups.filter(group => group.member_count >= 10);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-muted rounded-lg h-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-destructive mb-2">Failed to load groups</h2>
            <p className="text-destructive/80 mb-4">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Groups Directory</h1>
          <p className="text-lg text-muted-foreground mb-6">
            Discover and join community groups that match your interests
          </p>
          
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search groups by name, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-80"
              />
            </div>
            
            {user && (
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <CreateGroup open={showCreateDialog} onOpenChange={setShowCreateDialog} />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Groups
              <Badge variant="secondary">{filteredGroups.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="public" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Public
              <Badge variant="secondary">{publicGroups.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="featured" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Featured
              <Badge variant="secondary">{featuredGroups.length}</Badge>
            </TabsTrigger>
            {user && (
              <TabsTrigger value="my-groups" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                My Groups
                <Badge variant="secondary">{myGroups.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="all" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGroups.map((group) => (
                <GroupCard key={group.id} group={group} showJoinButton={!!user} />
              ))}
            </div>
            {filteredGroups.length === 0 && (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No groups found</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? "Try adjusting your search terms" 
                    : "Be the first to create a group!"
                  }
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="public" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {publicGroups.map((group) => (
                <GroupCard key={group.id} group={group} showJoinButton={!!user} />
              ))}
            </div>
            {publicGroups.length === 0 && (
              <div className="text-center py-12">
                <Globe className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No public groups found</h3>
                <p className="text-muted-foreground">
                  {searchQuery 
                    ? "Try adjusting your search terms" 
                    : "All groups are currently private"
                  }
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="featured" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredGroups.map((group) => (
                <GroupCard key={group.id} group={group} showJoinButton={!!user} />
              ))}
            </div>
            {featuredGroups.length === 0 && (
              <div className="text-center py-12">
                <Star className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No featured groups found</h3>
                <p className="text-muted-foreground">
                  Featured groups have 10+ members
                </p>
              </div>
            )}
          </TabsContent>

          {user && (
            <TabsContent value="my-groups" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myGroups.map((group) => (
                  <GroupCard key={group.id} group={group} showJoinButton={false} />
                ))}
              </div>
              {myGroups.length === 0 && (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">You haven't joined any groups yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Browse and join groups that match your interests
                  </p>
                  <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Your First Group
                  </Button>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default GroupsDirectory;