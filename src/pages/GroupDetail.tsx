import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGroups } from '@/hooks/useGroups';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Calendar, 
  Settings, 
  ArrowLeft, 
  Globe, 
  Lock, 
  Crown,
  Shield,
  UserPlus,
  UserMinus,
  MessageSquare,
  Hash
} from 'lucide-react';
import { toast } from 'sonner';

type GroupMember = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type CommunityGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  rules: string | null;
  tags: string[] | null;
};

const GroupDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { joinGroup, leaveGroup, checkMembership } = useGroups();
  
  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [currentMembership, setCurrentMembership] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroupDetails = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      
      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from('community_groups')
        .select('*')
        .eq('id', id)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch group members - using a simpler approach
      const { data: memberships, error: membershipsError } = await supabase
        .from('group_memberships')
        .select('*')
        .eq('group_id', id);

      if (membershipsError) throw membershipsError;

      // Fetch profile data for members
      const memberProfiles = await Promise.all(
        (memberships || []).map(async (membership) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', membership.user_id)
            .single();
          
          return {
            ...membership,
            profiles: profile
          };
        })
      );

      setMembers(memberProfiles);

      // Check current user's membership
      if (user) {
        const membership = await checkMembership(id);
        setCurrentMembership(membership);
      }

    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLeave = async () => {
    if (!group || !user) return;

    try {
      if (currentMembership) {
        const result = await leaveGroup(group.id);
        if (result.left) {
          setCurrentMembership(null);
          fetchGroupDetails(); // Refresh to update member count
        }
      } else {
        const result = await joinGroup(group.id);
        if (result.joined) {
          fetchGroupDetails(); // Refresh to get updated membership
        }
      }
    } catch (err: any) {
      toast.error('Failed to update membership');
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [id, user]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Group not found</h2>
          <p className="text-muted-foreground mb-4">
            The group you're looking for doesn't exist or you don't have permission to view it.
          </p>
          <Button onClick={() => navigate('/groups')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id === group.created_by;
  const isAdmin = currentMembership?.role === 'admin';
  const isModerator = currentMembership?.role === 'moderator';
  const canManage = isOwner || isAdmin || isModerator;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={() => navigate('/groups')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Groups
          </Button>
        </div>

        {/* Group Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={group.image_url || undefined} />
                  <AvatarFallback className="text-xl">
                    {group.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-2xl font-bold">{group.name}</h1>
                    {group.is_private ? (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Globe className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {group.member_count} members
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Created {new Date(group.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {user && !isOwner && (
                  <Button 
                    onClick={handleJoinLeave}
                    variant={currentMembership ? "outline" : "default"}
                    className="flex items-center gap-2"
                  >
                    {currentMembership ? (
                      <>
                        <UserMinus className="h-4 w-4" />
                        Leave Group
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Join Group
                      </>
                    )}
                  </Button>
                )}
                
                {canManage && (
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => toast.info('Group settings coming soon!')}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          
          {group.description && (
            <CardContent>
              <p className="text-muted-foreground">{group.description}</p>
            </CardContent>
          )}
        </Card>

        {/* Tags */}
        {group.tags && group.tags.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Content Tabs */}
        <Tabs defaultValue="about" className="space-y-4">
          <TabsList>
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>

          {/* About Tab */}
          <TabsContent value="about" className="space-y-4">
            {group.rules && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Group Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{group.rules}</p>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Group Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-1">Privacy</h4>
                    <p className="text-sm text-muted-foreground">
                      {group.is_private ? 'Private Group' : 'Public Group'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Members</h4>
                    <p className="text-sm text-muted-foreground">
                      {group.member_count} members
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Group Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.profiles?.avatar_url || undefined} />
                          <AvatarFallback>
                            {(member.profiles?.display_name || 'Anonymous')
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.profiles?.display_name || 'Anonymous User'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Joined {new Date(member.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {member.role === 'admin' && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Crown className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                        {member.role === 'moderator' && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Moderator
                          </Badge>
                        )}
                        {member.user_id === group.created_by && (
                          <Badge className="flex items-center gap-1">
                            <Crown className="h-3 w-3" />
                            Owner
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                  <p className="text-muted-foreground">
                    Group posts and discussions will appear here
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default GroupDetail;