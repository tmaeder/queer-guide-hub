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
      return <Badge variant="secondary"><Lock style={{ height: 12, width: 12, marginRight: 4 }} />Private</Badge>;
    }
    return <Badge variant="outline"><Globe style={{ height: 12, width: 12, marginRight: 4 }} />Public</Badge>;
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
    <div sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} />
          Back to Admin
        </Button>
        <div>
          <h1 sx={{ fontSize: '1.875rem', fontWeight: 700 }}>Groups Management</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Manage community groups and their settings</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Total Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{groups?.length || 0}</div>
            <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {filteredGroups.length !== groups?.length && `${filteredGroups.length} filtered`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Public Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {groups?.filter(g => !g.is_private).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Private Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {groups?.filter(g => g.is_private).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {groups?.reduce((sum, g) => sum + (g.member_count || 0), 0) || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader sx={{ pb: 1 }}>
            <CardTitle sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Total Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <div sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {Object.values(groupStats).reduce((sum, stats) => sum + stats.posts, 0)}
            </div>
            <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {Object.values(groupStats).reduce((sum, stats) => sum + stats.events, 0)} events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Bulk Actions */}
      <Card>
        <CardHeader>
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CardTitle>Manage Groups</CardTitle>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {selectedGroups.length > 0 && (
                <>
                  <Badge variant="secondary">{selectedGroups.length} selected</Badge>
                  {isAdmin && (
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 style={{ height: 16, width: 16, marginRight: 4 }} />
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
                <Filter style={{ height: 16, width: 16, marginRight: 4 }} />
                Filters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            <div sx={{ flex: 1, position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 12, top: 12, height: 16, width: 16, color: 'var(--muted-foreground)' }} />
              <Input
                placeholder="Search by name, description, or tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ pl: 5 }}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger sx={{ width: 200 }}>
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
            <div sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
              <h4 sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1 }}>Additional Filters</h4>
              <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <div>
                  <label sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Activity Level</label>
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
                  <label sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Member Count</label>
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
                  <label sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Created</label>
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
            <div sx={{ textAlign: 'center', py: 2 }}>Loading groups...</div>
          ) : filteredGroups.length === 0 ? (
            <div sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              No groups found matching your criteria.
            </div>
          ) : (
            <div sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead sx={{ width: 48 }}>
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
                        <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <div sx={{ height: 40, width: 40, borderRadius: 2, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.contrastText', fontWeight: 500 }}>
                            {group.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div sx={{ fontWeight: 500 }}>{group.name}</div>
                            {group.description && (
                              <div sx={{ fontSize: '0.875rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {group.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(group)}</TableCell>
                      <TableCell>
                        <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Users style={{ height: 16, width: 16 }} />
                          {group.member_count || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {getActivityBadge(group.id)}
                          <div sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {groupStats[group.id] && (
                              <>
                                <div sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <MessageSquare style={{ height: 12, width: 12 }} />
                                  {groupStats[group.id].posts} posts
                                </div>
                                <div sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Calendar style={{ height: 12, width: 12 }} />
                                  {groupStats[group.id].events} events
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {group.tags && group.tags.length > 0 ? (
                          <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 200 }}>
                            {group.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" sx={{ fontSize: '0.75rem' }}>
                                {tag}
                              </Badge>
                            ))}
                            {group.tags.length > 2 && (
                              <Badge variant="outline" sx={{ fontSize: '0.75rem' }}>
                                +{group.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>No tags</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Calendar style={{ height: 16, width: 16 }} />
                          {new Date(group.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/groups/${group.id}`)}
                            title="View Group"
                          >
                            <Eye style={{ height: 16, width: 16 }} />
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" title="Group Details">
                                <MoreVertical style={{ height: 16, width: 16 }} />
                              </Button>
                            </DialogTrigger>
                            <DialogContent sx={{ maxWidth: 448 }}>
                              <DialogHeader>
                                <DialogTitle>{group.name} - Details</DialogTitle>
                              </DialogHeader>
                              <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div>
                                  <h4 sx={{ fontWeight: 500, mb: 1 }}>Description</h4>
                                  <p sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                    {group.description || "No description"}
                                  </p>
                                </div>
                                {group.rules && (
                                  <div>
                                    <h4 sx={{ fontWeight: 500, mb: 1 }}>Rules</h4>
                                    <p sx={{ fontSize: '0.875rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
                                      {group.rules}
                                    </p>
                                  </div>
                                )}
                                {group.tags && group.tags.length > 0 && (
                                  <div>
                                    <h4 sx={{ fontWeight: 500, mb: 1 }}>Tags</h4>
                                    <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                      {group.tags.map((tag) => (
                                        <Badge key={tag} variant="outline">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <h4 sx={{ fontWeight: 500, mb: 1 }}>Statistics</h4>
                                  <div sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, fontSize: '0.875rem' }}>
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
                              sx={{ color: 'error.main', '&:hover': { color: 'error.main' } }}
                              title="Delete Group"
                            >
                              <Trash2 style={{ height: 16, width: 16 }} />
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