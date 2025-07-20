import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useGroups } from "@/hooks/useGroups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Search, Users, Lock, Globe, Calendar, Trash2, Edit, Eye, MoreVertical, MessageSquare, Tag, TrendingUp, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function AdminGroups() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, canManageContent } = useAdminRoles();
  const { groups, isLoading } = useGroups();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupStats, setGroupStats] = useState<{[key: string]: {posts: number, events: number, activeMembers: number}}>({});
  const [showFilters, setShowFilters] = useState(false);

  
  console.log('AdminGroups - user:', user?.email);
  console.log('AdminGroups - canManageContent:', canManageContent());
  console.log('AdminGroups - isAdmin:', isAdmin);
  
  useEffect(() => {
    if (!user || !canManageContent()) {
      console.log('AdminGroups - Redirecting to /admin due to lack of permissions');
      navigate("/admin");
    }
  }, [user, canManageContent, navigate]);

  // Load group stats
  useEffect(() => {
    const loadGroupStats = async () => {
      if (!groups || groups.length === 0) return;
      
      const stats: {[key: string]: {posts: number, events: number, activeMembers: number}} = {};
      
      for (const group of groups) {
        try {
          const [postsResult, eventsResult, membersResult] = await Promise.all([
            supabase.from('group_posts').select('id', { count: 'exact', head: true }).eq('group_id', group.id),
            supabase.from('events').select('id', { count: 'exact', head: true }).eq('group_id', group.id),
            supabase.from('group_memberships').select('id', { count: 'exact', head: true }).eq('group_id', group.id)
          ]);
          
          stats[group.id] = {
            posts: postsResult.count || 0,
            events: eventsResult.count || 0,
            activeMembers: membersResult.count || 0
          };
        } catch (error) {
          console.error(`Error loading stats for group ${group.id}:`, error);
          stats[group.id] = { posts: 0, events: 0, activeMembers: 0 };
        }
      }
      
      setGroupStats(stats);
    };

    loadGroupStats();
  }, [groups]);

  if (!user || !canManageContent()) {
    console.log('AdminGroups - Rendering null due to lack of permissions');
    return null;
  }

  const filteredGroups = groups?.filter(group => {
    const matchesSearch = group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         group.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         group.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = typeFilter === "all" || 
                       (typeFilter === "private" && group.is_private) ||
                       (typeFilter === "public" && !group.is_private);
    
    return matchesSearch && matchesType;
  }) || [];

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('community_groups')
        .delete()
        .eq('id', groupId);

      if (error) {
        throw error;
      }

      toast({
        title: "Group deleted",
        description: "The group has been successfully deleted.",
      });
    } catch (error) {
      console.error("Error deleting group:", error);
      toast({
        title: "Error",
        description: "Failed to delete group. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedGroups.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedGroups.length} groups? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('community_groups')
        .delete()
        .in('id', selectedGroups);

      if (error) throw error;

      toast({
        title: "Groups deleted",
        description: `${selectedGroups.length} groups have been successfully deleted.`,
      });
      setSelectedGroups([]);
    } catch (error) {
      console.error("Error deleting groups:", error);
      toast({
        title: "Error",
        description: "Failed to delete groups. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (group: any) => {
    if (group.is_private) {
      return <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Private</Badge>;
    }
    return <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Public</Badge>;
  };

  const getActivityLevel = (groupId: string) => {
    const stats = groupStats[groupId];
    if (!stats) return "No data";
    
    const totalActivity = stats.posts + stats.events;
    if (totalActivity > 20) return "High";
    if (totalActivity > 10) return "Medium";
    if (totalActivity > 0) return "Low";
    return "Inactive";
  };

  const getActivityBadge = (groupId: string) => {
    const level = getActivityLevel(groupId);
    const variant = level === "High" ? "default" : 
                   level === "Medium" ? "secondary" : 
                   level === "Low" ? "outline" : "destructive";
    
    return <Badge variant={variant}>{level}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Groups Management</h1>
          <p className="text-muted-foreground">Manage community groups and their settings</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {filteredGroups.length !== groups?.length && `${filteredGroups.length} filtered`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Public Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {groups?.filter(g => !g.is_private).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Private Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {groups?.filter(g => g.is_private).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {groups?.reduce((sum, g) => sum + (g.member_count || 0), 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.values(groupStats).reduce((sum, stats) => sum + stats.posts, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.values(groupStats).reduce((sum, stats) => sum + stats.events, 0)} events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Bulk Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manage Groups</CardTitle>
            <div className="flex items-center gap-2">
              {selectedGroups.length > 0 && (
                <>
                  <Badge variant="secondary">{selectedGroups.length} selected</Badge>
                  {isAdmin && (
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected
                    </Button>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, description, or tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="public">Public Groups</SelectItem>
                <SelectItem value="private">Private Groups</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {showFilters && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Additional Filters</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Activity Level</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Any activity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="high">High Activity</SelectItem>
                      <SelectItem value="medium">Medium Activity</SelectItem>
                      <SelectItem value="low">Low Activity</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Member Count</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Any size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sizes</SelectItem>
                      <SelectItem value="small">Small (1-10)</SelectItem>
                      <SelectItem value="medium">Medium (11-50)</SelectItem>
                      <SelectItem value="large">Large (50+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Created</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="week">Last Week</SelectItem>
                      <SelectItem value="month">Last Month</SelectItem>
                      <SelectItem value="quarter">Last Quarter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Groups Table */}
      <Card>
        <CardHeader>
          <CardTitle>Groups ({filteredGroups.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Loading groups...</div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No groups found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedGroups.length === filteredGroups.length && filteredGroups.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedGroups(filteredGroups.map(g => g.id));
                          } else {
                            setSelectedGroups([]);
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedGroups.includes(group.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedGroups([...selectedGroups, group.id]);
                            } else {
                              setSelectedGroups(selectedGroups.filter(id => id !== group.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center text-white font-medium">
                            {group.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">{group.name}</div>
                            {group.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {group.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(group)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {group.member_count || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {getActivityBadge(group.id)}
                          <div className="text-xs text-muted-foreground">
                            {groupStats[group.id] && (
                              <>
                                <div className="flex items-center gap-1">
                                  <MessageSquare className="h-3 w-3" />
                                  {groupStats[group.id].posts} posts
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {groupStats[group.id].events} events
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {group.tags && group.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {group.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {group.tags.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{group.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">No tags</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(group.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/groups/${group.id}`)}
                            title="View Group"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" title="Group Details">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>{group.name} - Details</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="font-medium mb-2">Description</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {group.description || "No description"}
                                  </p>
                                </div>
                                {group.rules && (
                                  <div>
                                    <h4 className="font-medium mb-2">Rules</h4>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {group.rules}
                                    </p>
                                  </div>
                                )}
                                {group.tags && group.tags.length > 0 && (
                                  <div>
                                    <h4 className="font-medium mb-2">Tags</h4>
                                    <div className="flex flex-wrap gap-1">
                                      {group.tags.map((tag) => (
                                        <Badge key={tag} variant="outline">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <h4 className="font-medium mb-2">Statistics</h4>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>Members: {group.member_count || 0}</div>
                                    <div>Posts: {groupStats[group.id]?.posts || 0}</div>
                                    <div>Events: {groupStats[group.id]?.events || 0}</div>
                                    <div>Activity: {getActivityLevel(group.id)}</div>
                                  </div>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteGroup(group.id)}
                              className="text-destructive hover:text-destructive"
                              title="Delete Group"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}