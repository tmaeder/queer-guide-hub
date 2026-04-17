import { useState, useEffect } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
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
  Clock,
  Shield,
  Crown,
  User,
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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';import { useTranslation } from 'react-i18next';


export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  const { groups, userGroups, isLoading, joinGroup, isJoining, leaveGroup, isLeaving } =
    useGroups();

  const {
    posts,
    groupMembers,
    isLoading: postsLoading,
    createPost,
    isCreatingPost,
    likePost,
    unlikePost,
    voteOnPoll,
    togglePin,
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
    isDeletingEvent,
  } = useGroupEvents(groupId || '');

  const [group, setGroup] = useState<Group | null>(null);
  const [activeTab, setActiveTab] = useState('about');

  useEffect(() => {
    if (!groupId) return;

    // Find group in both arrays
    const foundGroup = [...groups, ...userGroups].find((g) => g.id === groupId);
    setGroup(foundGroup || null);
  }, [groupId, groups, userGroups]);

  const handleJoin = () => {
    if (!group) return;

    joinGroup(group.id);
    // Update local group state optimistically
    setGroup((prev) =>
      prev ? { ...prev, is_member: true, member_count: prev.member_count + 1 } : null,
    );
  };

  const handleLeave = () => {
    if (!group) return;

    leaveGroup(group.id);
    // Update local group state optimistically
    setGroup((prev) =>
      prev ? { ...prev, is_member: false, member_count: prev.member_count - 1 } : null,
    );
  };

  if (!user) {
    return (
      <Box sx={{ mx: 'auto', py: 4 }}>
        <Alert>
          <AlertDescription>{t('pages.groupDetail.signInRequired', 'Please sign in to view group details.')}</AlertDescription>
        </Alert>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ mx: 'auto', py: 4 }}>
        <div
          style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <Box sx={{ height: 32, bgcolor: 'action.hover', borderRadius: 1, width: '33%' }} />
          <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 1 }} />
          <Box sx={{ height: 256, bgcolor: 'action.hover', borderRadius: 1 }} />
        </div>
      </Box>
    );
  }

  if (!group) {
    return (
      <Box sx={{ mx: 'auto', py: 4 }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h5" component="h1" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Group not found
          </Typography>
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            The group you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button asChild>
            <LocalizedLink to="/groups">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
              Back to Groups
            </LocalizedLink>
          </Button>
        </Box>
      </Box>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <Box
      sx={{ mx: 'auto', py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back
        </Button>
      </Box>

      {/* Group Hero */}
      <Card>
        <CardContent style={{ padding: '32px' }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
            <Avatar style={{ height: 96, width: 96 }}>
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback
                style={{
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  fontSize: '1.5rem',
                }}
              >
                {group.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <Box
              sx={{
                flex: 1,
                textAlign: { xs: 'center', md: 'left' },
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    justifyContent: { xs: 'center', md: 'flex-start' },
                    mb: 1,
                  }}
                >
                  <Typography
                    variant="h4"
                    component="h1"
                    sx={{ fontSize: '1.875rem', fontWeight: 700 }}
                  >
                    {group.name}
                  </Typography>
                  {group.is_private ? (
                    <Lock style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))' }} />
                  ) : (
                    <Globe style={{ height: 20, width: 20, color: 'hsl(var(--muted-foreground))' }} />
                  )}
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    justifyContent: { xs: 'center', md: 'flex-start' },
                    color: 'text.secondary',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Users style={{ height: 16, width: 16 }} />
                    <span>{group.member_count} members</span>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Clock style={{ height: 16, width: 16 }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </Box>
                </Box>

                {group.user_role && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: { xs: 'center', md: 'flex-start' },
                      mt: 1,
                    }}
                  >
                    <Badge
                      variant="secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {group.user_role === 'admin' && <Crown style={{ height: 12, width: 12 }} />}
                      {group.user_role === 'moderator' && (
                        <Shield style={{ height: 12, width: 12 }} />
                      )}
                      {group.user_role === 'member' && <User style={{ height: 12, width: 12 }} />}
                      {group.user_role}
                    </Badge>
                  </Box>
                )}
              </div>

              {group.description && <p style={{ color: 'hsl(var(--muted-foreground))' }}>{group.description}</p>}

              {group.tags && group.tags.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box
                    component="span"
                    sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}
                  >
                    Tags:
                  </Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {group.tags.map((tag) => (
                      <Badge key={tag} variant="outline" style={{ fontSize: '0.75rem' }}>
                        {tag}
                      </Badge>
                    ))}
                  </Box>
                </Box>
              )}

              <Box
                sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' } }}
              >
                {!group.is_member ? (
                  <Button
                    onClick={handleJoin}
                    disabled={isJoining}
                    style={{ background: 'var(--gradient-primary)' }}
                  >
                    <UserPlus style={{ height: 16, width: 16, marginRight: 8 }} />
                    {isJoining ? 'Joining...' : 'Join Group'}
                  </Button>
                ) : (
                  <Button onClick={handleLeave} disabled={isLeaving} variant="outline">
                    <UserMinus style={{ height: 16, width: 16, marginRight: 8 }} />
                    {isLeaving ? 'Leaving...' : 'Leave Group'}
                  </Button>
                )}

                {canManage && (
                  <Button variant="outline">
                    <Settings style={{ height: 16, width: 16, marginRight: 8 }} />
                    Manage Group
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <TabsTrigger value="about" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users style={{ height: 16, width: 16 }} />
            About
          </TabsTrigger>
          <TabsTrigger
            value="members"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Users style={{ height: 16, width: 16 }} />
            Members
          </TabsTrigger>
          <TabsTrigger value="posts" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare style={{ height: 16, width: 16 }} />
            Posts
          </TabsTrigger>
          <TabsTrigger value="events" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar style={{ height: 16, width: 16 }} />
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="about"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <Card>
            <CardHeader>
              <CardTitle>About this group</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {group.description ? (
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  {group.description}
                </Typography>
              ) : (
                <Typography sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                  No description available.
                </Typography>
              )}

              <Separator />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
                  Group Details
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2,
                    fontSize: '0.875rem',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                    <span>{group.member_count} members</span>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {group.is_private ? (
                      <>
                        <Lock style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                        <span>Private group</span>
                      </>
                    ) : (
                      <>
                        <Globe style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                        <span>Public group</span>
                      </>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </Box>
                </Box>
              </Box>

              {group.tags && group.tags.length > 0 && (
                <>
                  <Separator />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
                      Tags
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {group.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </Box>
                  </Box>
                </>
              )}

              {group.rules && (
                <>
                  <Separator />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 600 }}>
                      Group Rules
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.875rem', color: 'text.secondary', whiteSpace: 'pre-wrap' }}
                    >
                      {group.rules}
                    </Typography>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="members"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Members ({group.member_count})</CardTitle>
            </CardHeader>
            <CardContent>
              {groupMembers.length === 0 ? (
                <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                  No members found.
                </Typography>
              ) : (
                <GroupMembersList
                  members={groupMembers}
                  canManage={canManage}
                  onStartConversation={(_userId) => {
                    // TODO: Implement conversation starting
                    toast({
                      title: 'Not yet available',
                      description: 'Direct messaging is not yet available.',
                    });
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="posts"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
              Group Posts
            </Typography>
            {group.is_member && (
              <CreatePostDialog
                onCreatePost={createPost}
                isCreating={isCreatingPost}
                groupMembers={groupMembers}
                canCreateAnnouncement={canManage}
                canPin={canManage}
              />
            )}
          </Box>

          {postsLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                >
                  <Box sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 2 }} />
                </div>
              ))}
            </Box>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <MessageSquare
                  style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' }}
                />
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}
                >
                  No posts yet
                </Typography>
                <Typography sx={{ color: 'text.secondary', mb: 2 }}>
                  {group.is_member
                    ? 'Be the first to start a conversation in this group!'
                    : 'Join the group to see and participate in discussions.'}
                </Typography>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            </Box>
          )}
        </TabsContent>

        <TabsContent
          value="events"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
              Group Events
            </Typography>
            {group.is_member && (
              <CreateGroupEventDialog onCreateEvent={createEvent} isCreating={isCreatingEvent} />
            )}
          </Box>

          {eventsLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                >
                  <Box sx={{ height: 192, bgcolor: 'action.hover', borderRadius: 2 }} />
                </div>
              ))}
            </Box>
          ) : events.length === 0 ? (
            <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <Calendar
                  style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' }}
                />
                <Typography
                  variant="h6"
                  component="h3"
                  sx={{ fontSize: '1.125rem', fontWeight: 600, mb: 1 }}
                >
                  No events yet
                </Typography>
                <Typography sx={{ color: 'text.secondary', mb: 2 }}>
                  {group.is_member
                    ? 'Be the first to create an event for this group!'
                    : 'Join the group to see and participate in events.'}
                </Typography>
                {group.is_member && (
                  <CreateGroupEventDialog
                    onCreateEvent={createEvent}
                    isCreating={isCreatingEvent}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            </Box>
          )}
        </TabsContent>
      </Tabs>
    </Box>
  );
}
