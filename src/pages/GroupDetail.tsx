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
import { useQueryClient } from '@tanstack/react-query';
import { useGroups, Group } from '@/hooks/useGroups';
import { useGroupPosts } from '@/hooks/useGroupPosts';
import { useGroupEvents } from '@/hooks/useGroupEvents';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { GroupPostCard } from '@/components/groups/GroupPostCard';
import { CreatePostDialog } from '@/components/groups/CreatePostDialog';
import { GroupMembersList } from '@/components/groups/GroupMembersList';
import { AddMemberDialog } from '@/components/groups/AddMemberDialog';
import { CreateGroupEventDialog } from '@/components/groups/CreateGroupEventDialog';
import { GroupEventCard } from '@/components/groups/GroupEventCard';
import { useTranslation } from 'react-i18next';

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

    const foundGroup = [...groups, ...userGroups].find((g) => g.id === groupId);
    setGroup(foundGroup || null);
  }, [groupId, groups, userGroups]);

  const handleJoin = () => {
    if (!group) return;

    joinGroup(group.id);
    setGroup((prev) =>
      prev ? { ...prev, is_member: true, member_count: prev.member_count + 1 } : null,
    );
  };

  const handleLeave = () => {
    if (!group) return;

    leaveGroup(group.id);
    setGroup((prev) =>
      prev ? { ...prev, is_member: false, member_count: prev.member_count - 1 } : null,
    );
  };

  if (!user) {
    return (
      <div className="mx-auto py-8">
        <Alert>
          <AlertDescription>{t('pages.groupDetail.signInRequired', 'Please sign in to view group details.')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto py-8">
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto py-8">
        <div className="text-center flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Group not found</h1>
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            The group you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button asChild>
            <LocalizedLink to="/groups">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
              Back to Groups
            </LocalizedLink>
          </Button>
        </div>
      </div>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <div className="mx-auto py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back
        </Button>
      </div>

      {/* Group Hero */}
      <Card>
        <CardContent style={{ padding: '32px' }}>
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="rounded-2xl border border-border shadow-sm" style={{ height: 112, width: 112 }}>
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback
                style={{
                  background: 'hsl(var(--foreground))',
                  color: 'hsl(var(--background))',
                  fontSize: '1.75rem',
                  fontWeight: 700,
                }}
              >
                {group.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center md:text-left flex flex-col gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {group.is_private ? (
                    <Lock style={{ height: 12, width: 12 }} />
                  ) : (
                    <Globe style={{ height: 12, width: 12 }} />
                  )}
                  {group.is_private ? 'Private group' : 'Public group'}
                </div>
                <div className="flex items-center gap-3 justify-center md:justify-start mb-2 flex-wrap">
                  <h1 className="text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight text-balance">{group.name}</h1>
                </div>

                <div className="flex items-center gap-4 justify-center md:justify-start text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users style={{ height: 16, width: 16 }} />
                    <span>{group.member_count} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock style={{ height: 16, width: 16 }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {group.user_role && (
                  <div className="flex justify-center md:justify-start mt-2">
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
                  </div>
                )}
              </div>

              {group.description && <p style={{ color: 'hsl(var(--muted-foreground))' }}>{group.description}</p>}

              {group.tags && group.tags.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Tags:</span>
                  <div className="flex flex-wrap gap-2">
                    {group.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                        onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-center md:justify-start">
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
                  <Button variant="outline" onClick={() => setActiveTab('members')}>
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
                <p className="text-muted-foreground" style={{ lineHeight: 1.7 }}>
                  {group.description}
                </p>
              ) : (
                <p className="text-muted-foreground italic">No description available.</p>
              )}

              <Separator />

              <div className="flex flex-col gap-3">
                <h4 className="text-base font-semibold">Group Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Users style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                    <span>{group.member_count} members</span>
                  </div>
                  <div className="flex items-center gap-2">
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
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                    <span>Created {new Date(group.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {group.tags && group.tags.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-3">
                    <h4 className="text-base font-semibold">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/resources/${encodeURIComponent(tag)}`)}
                        >
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
                  <div className="flex flex-col gap-3">
                    <h4 className="text-base font-semibold">Group Rules</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {group.rules}
                    </p>
                  </div>
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
              <div className="flex items-center justify-between">
                <CardTitle>Members ({group.member_count})</CardTitle>
                {canManage && groupId && (
                  <AddMemberDialog
                    groupId={groupId}
                    existingMemberIds={groupMembers.map(m => m.user_id)}
                    onMemberAdded={() => queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {groupMembers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No members found.</p>
              ) : (
                <GroupMembersList
                  members={groupMembers}
                  canManage={canManage}
                  groupId={groupId}
                  onStartConversation={(_userId) => {
                    toast({
                      title: 'Not yet available',
                      description: 'Direct messaging is not yet available.',
                    });
                  }}
                  onMembersChanged={() => queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="posts"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
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
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-32 bg-muted rounded-lg" />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <MessageSquare
                  style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' }}
                />
                <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                <p className="text-muted-foreground mb-4">
                  {group.is_member
                    ? 'Be the first to start a conversation in this group!'
                    : 'Join the group to see and participate in discussions.'}
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
            <div className="flex flex-col gap-4">
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

        <TabsContent
          value="events"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Group Events</h3>
            {group.is_member && (
              <CreateGroupEventDialog onCreateEvent={createEvent} isCreating={isCreatingEvent} />
            )}
          </div>

          {eventsLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-48 bg-muted rounded-lg" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent style={{ padding: '32px', textAlign: 'center' }}>
                <Calendar
                  style={{ height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' }}
                />
                <h3 className="text-lg font-semibold mb-2">No events yet</h3>
                <p className="text-muted-foreground mb-4">
                  {group.is_member
                    ? 'Be the first to create an event for this group!'
                    : 'Join the group to see and participate in events.'}
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
            <div className="flex flex-col gap-4">
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
