import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Users, 
  Lock, 
  Globe, 
  ArrowLeft, 
  UserPlus, 
  UserMinus, 
  Settings, 
  Calendar,
  MessageSquare,
  Image as ImageIcon,
  MapPin,
  Clock,
  Shield,
  Crown,
  User
} from 'lucide-react';
import { useGroups, Group } from '@/hooks/useGroups';
import { useGroupPosts } from '@/hooks/useGroupPosts';
import { useGroupEvents } from '@/hooks/useGroupEvents';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { GroupPostCard } from '@/components/groups/GroupPostCard';
import { CreatePostDialog } from '@/components/groups/CreatePostDialog';
import { GroupMembersList } from '@/components/groups/GroupMembersList';
import { CreateGroupEventDialog } from '@/components/groups/CreateGroupEventDialog';
import { GroupEventCard } from '@/components/groups/GroupEventCard';

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const {
    groups,
    userGroups,
    isLoading,
    joinGroup,
    isJoining,
    leaveGroup,
    isLeaving
  } = useGroups();

  const {
    posts,
    groupMembers,
    isLoading: postsLoading,
    createPost,
    isCreatingPost,
    likePost,
    unlikePost,
    voteOnPoll,
    togglePin
  } = useGroupPosts(groupId || '');

  const {
    events,
    isLoading: eventsLoading,
    createEvent,
    isCreatingEvent,
    joinEvent,
    isJoiningEvent,
    leaveEvent,
    isLeavingEvent,
    deleteEvent,
    isDeletingEvent
  } = useGroupEvents(groupId || '');

  const [group, setGroup] = useState<Group | null>(null);
  const [activeTab, setActiveTab] = useState("about");

  useEffect(() => {
    if (!groupId) return;
    
    // Find group in both arrays
    const foundGroup = [...groups, ...userGroups].find(g => g.id === groupId);
    setGroup(foundGroup || null);
  }, [groupId, groups, userGroups]);

  const handleJoin = () => {
    if (!group) return;
    
    joinGroup(group.id);
    // Update local group state optimistically
    setGroup(prev => prev ? { ...prev, is_member: true, member_count: prev.member_count + 1 } : null);
  };

  const handleLeave = () => {
    if (!group) return;
    
    leaveGroup(group.id);
    // Update local group state optimistically
    setGroup(prev => prev ? { ...prev, is_member: false, member_count: prev.member_count - 1 } : null);
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Alert>
          <AlertDescription>
            Please sign in to view group details.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Group not found</h1>
          <p className="text-muted-foreground">The group you're looking for doesn't exist or you don't have access to it.</p>
          <Button asChild>
            <Link to="/groups">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Groups
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';
  const isOwner = group.user_role === 'admin';

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Group Hero */}
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24 mx-auto md:mx-0">
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-2xl">
                {group.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                  <h1 className="text-3xl font-bold">{group.name}</h1>
                  {group.is_private ? (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex items-center gap-4 justify-center md:justify-start text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{group.member_count} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {group.user_role && (
                  <div className="flex justify-center md:justify-start mt-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {group.user_role === 'admin' && <Crown className="h-3 w-3" />}
                      {group.user_role === 'moderator' && <Shield className="h-3 w-3" />}
                      {group.user_role === 'member' && <User className="h-3 w-3" />}
                      {group.user_role}
                    </Badge>
                  </div>
                )}
              </div>

              {group.description && (
                <p className="text-muted-foreground">{group.description}</p>
              )}

              <div className="flex gap-2 justify-center md:justify-start">
                {!group.is_member ? (
                  <Button
                    onClick={handleJoin}
                    disabled={isJoining}
                    className="bg-gradient-primary hover:opacity-90"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {isJoining ? "Joining..." : "Join Group"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleLeave}
                    disabled={isLeaving}
                    variant="outline"
                  >
                    <UserMinus className="h-4 w-4 mr-2" />
                    {isLeaving ? "Leaving..." : "Leave Group"}
                  </Button>
                )}

                {canManage && (
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Group
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="about" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            About
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="posts" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Posts
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About this group</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.description ? (
                <p className="text-muted-foreground leading-relaxed">{group.description}</p>
              ) : (
                <p className="text-muted-foreground italic">No description available.</p>
              )}

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold">Group Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{group.member_count} members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.is_private ? (
                      <>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span>Private group</span>
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span>Public group</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {group.rules && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-semibold">Group Rules</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{group.rules}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Members ({group.member_count})</CardTitle>
            </CardHeader>
            <CardContent>
              {groupMembers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No members found.
                </p>
              ) : (
                <GroupMembersList 
                  members={groupMembers}
                  canManage={canManage}
                  onStartConversation={(userId) => {
                    // TODO: Implement conversation starting
                    toast({
                      title: "Feature coming soon",
                      description: "Direct messaging will be available soon."
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Group Posts</h3>
            {group.is_member && (
              <CreatePostDialog
                onCreatePost={createPost}
                isCreating={isCreatingPost}
                groupMembers={groupMembers}
                canCreateAnnouncement={canManage}
                canPin={canManage}
              />
            )}
          </div>

          {postsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-32 bg-muted rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                <p className="text-muted-foreground mb-4">
                  {group.is_member 
                    ? "Be the first to start a conversation in this group!" 
                    : "Join the group to see and participate in discussions."}
                </p>
                {group.is_member && (
                  <CreatePostDialog
                    onCreatePost={createPost}
                    isCreating={isCreatingPost}
                    groupMembers={groupMembers}
                    canCreateAnnouncement={canManage}
                    canPin={canManage}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <GroupPostCard
                  key={post.id}
                  post={post}
                  onLike={likePost}
                  onUnlike={unlikePost}
                  onVote={voteOnPoll}
                  onTogglePin={canManage ? togglePin : undefined}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Group Events</h3>
            {group.is_member && (
              <CreateGroupEventDialog
                onCreateEvent={createEvent}
                isCreating={isCreatingEvent}
              />
            )}
          </div>

          {eventsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-48 bg-muted rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No events yet</h3>
                <p className="text-muted-foreground mb-4">
                  {group.is_member 
                    ? "Be the first to create an event for this group!" 
                    : "Join the group to see and participate in events."}
                </p>
                {group.is_member && (
                  <CreateGroupEventDialog
                    onCreateEvent={createEvent}
                    isCreating={isCreatingEvent}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <GroupEventCard
                  key={event.id}
                  event={event}
                  onJoinEvent={joinEvent}
                  onLeaveEvent={leaveEvent}
                  onDeleteEvent={canManage ? deleteEvent : undefined}
                  isJoining={isJoiningEvent}
                  isLeaving={isLeavingEvent}
                  isDeleting={isDeletingEvent}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}