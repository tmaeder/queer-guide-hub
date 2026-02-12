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
      <div sx={{ maxWidth: 896, mx: 'auto', py: 4 }}>
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
      <div sx={{ maxWidth: 896, mx: 'auto', py: 4 }}>
        <div sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%' }}></div>
          <div sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }}></div>
          <div sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }}></div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div sx={{ maxWidth: 896, mx: 'auto', py: 4 }}>
        <div sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Group not found</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>The group you're looking for doesn't exist or you don't have access to it.</p>
          <Button asChild>
            <Link to="/groups">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
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
    <div sx={{ maxWidth: 896, mx: 'auto', py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <div sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back
        </Button>
      </div>

      {/* Group Hero */}
      <Card>
        <CardContent sx={{ p: 4 }}>
          <div sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
            <Avatar sx={{ height: 96, width: 96, mx: { xs: 'auto', md: 0 } }}>
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback sx={{ background: 'var(--gradient-primary)', color: 'primary.contrastText', fontSize: '1.5rem' }}>
                {group.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div sx={{ flex: 1, textAlign: { xs: 'center', md: 'left' }, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div>
                <div sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: { xs: 'center', md: 'flex-start' }, mb: 1 }}>
                  <h1 sx={{ fontSize: '1.875rem', fontWeight: 700 }}>{group.name}</h1>
                  {group.is_private ? (
                    <Lock style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                  ) : (
                    <Globe style={{ height: 20, width: 20, color: 'var(--muted-foreground)' }} />
                  )}
                </div>
                
                <div sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: { xs: 'center', md: 'flex-start' }, color: 'text.secondary' }}>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Users style={{ height: 16, width: 16 }} />
                    <span>{group.member_count} members</span>
                  </div>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Clock style={{ height: 16, width: 16 }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {group.user_role && (
                  <div sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-start' }, mt: 1 }}>
                    <Badge variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {group.user_role === 'admin' && <Crown style={{ height: 12, width: 12 }} />}
                      {group.user_role === 'moderator' && <Shield style={{ height: 12, width: 12 }} />}
                      {group.user_role === 'member' && <User style={{ height: 12, width: 12 }} />}
                      {group.user_role}
                    </Badge>
                  </div>
                )}
              </div>

              {group.description && (
                <p style={{ color: 'var(--muted-foreground)' }}>{group.description}</p>
              )}

              {group.tags && group.tags.length > 0 && (
                <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Tags:</span>
                  <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {group.tags.map((tag) => (
                      <Badge key={tag} variant="outline" sx={{ fontSize: '0.75rem' }}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                {!group.is_member ? (
                  <Button
                    onClick={handleJoin}
                    disabled={isJoining}
                    sx={{ background: 'var(--gradient-primary)', '&:hover': { opacity: 0.9 } }}
                  >
                    <UserPlus style={{ height: 16, width: 16, marginRight: 8 }} />
                    {isJoining ? "Joining..." : "Join Group"}
                  </Button>
                ) : (
                  <Button
                    onClick={handleLeave}
                    disabled={isLeaving}
                    variant="outline"
                  >
                    <UserMinus style={{ height: 16, width: 16, marginRight: 8 }} />
                    {isLeaving ? "Leaving..." : "Leave Group"}
                  </Button>
                )}

                {canManage && (
                  <Button variant="outline">
                    <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
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
        <TabsList sx={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="about" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Users style={{ height: 16, width: 16 }} />
            About
          </TabsTrigger>
          <TabsTrigger value="members" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Users style={{ height: 16, width: 16 }} />
            Members
          </TabsTrigger>
          <TabsTrigger value="posts" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MessageSquare style={{ height: 16, width: 16 }} />
            Posts
          </TabsTrigger>
          <TabsTrigger value="events" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar style={{ height: 16, width: 16 }} />
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="about" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle>About this group</CardTitle>
            </CardHeader>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {group.description ? (
                <p sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{group.description}</p>
              ) : (
                <p sx={{ color: 'text.secondary', fontStyle: 'italic' }}>No description available.</p>
              )}

              <Separator />

              <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <h4 sx={{ fontWeight: 600 }}>Group Details</h4>
                <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, fontSize: '0.875rem' }}>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                    <span>{group.member_count} members</span>
                  </div>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {group.is_private ? (
                      <>
                        <Lock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                        <span>Private group</span>
                      </>
                    ) : (
                      <>
                        <Globe style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                        <span>Public group</span>
                      </>
                    )}
                  </div>
                  <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {group.tags && group.tags.length > 0 && (
                <>
                  <Separator />
                  <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <h4 sx={{ fontWeight: 600 }}>Tags</h4>
                    <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {group.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {group.rules && (
                <>
                  <Separator />
                  <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <h4 sx={{ fontWeight: 600 }}>Group Rules</h4>
                    <p sx={{ fontSize: '0.875rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{group.rules}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card>
            <CardHeader>
              <CardTitle>Members ({group.member_count})</CardTitle>
            </CardHeader>
            <CardContent>
              {groupMembers.length === 0 ? (
                <p sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                  No members found.
                </p>
              ) : (
                <GroupMembersList 
                  members={groupMembers}
                  canManage={canManage}
                  onStartConversation={(userId) => {
                    // TODO: Implement conversation starting
                    toast({
                      title: "Not yet available",
                      description: "Direct messaging is not yet available."
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Group Posts</h3>
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
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                  <div sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 2 }}></div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <MessageSquare style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No posts yet</h3>
                <p sx={{ color: 'text.secondary', mb: 2 }}>
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
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

        <TabsContent value="events" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Group Events</h3>
            {group.is_member && (
              <CreateGroupEventDialog
                onCreateEvent={createEvent}
                isCreating={isCreatingEvent}
              />
            )}
          </div>

          {eventsLoading ? (
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                  <div sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 2 }}></div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent sx={{ p: 4, textAlign: 'center' }}>
                <Calendar style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <h3 sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}>No events yet</h3>
                <p sx={{ color: 'text.secondary', mb: 2 }}>
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
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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