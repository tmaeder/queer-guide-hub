import { useState } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocation, useParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Lock,
  Globe,
  ArrowLeft,
  ArrowRight,
  UserPlus,
  UserMinus,
  Settings,
  Calendar,
  MessageSquare,
  Folder,
  Scale,
} from '@/components/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useGroups } from '@/hooks/useGroups';
import { useGroupPosts } from '@/hooks/useGroupPosts';
import { useGroupEvents, usePublicGroupMeetup } from '@/hooks/useGroupEvents';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { GroupPostCard } from '@/components/groups/GroupPostCard';
import { GroupPostDialog } from '@/components/groups/GroupPostDialog';
import { GroupMembersList } from '@/components/groups/GroupMembersList';
import { AddMemberDialog } from '@/components/groups/AddMemberDialog';
import { InviteFriendsDialog } from '@/components/groups/InviteFriendsDialog';
import { CreateGroupEventDialog } from '@/components/groups/CreateGroupEventDialog';
import { GroupEventCard } from '@/components/groups/GroupEventCard';
import { GroupNextMeetup } from '@/components/groups/GroupNextMeetup';
import { useTranslation } from 'react-i18next';
import { Editable } from '@/components/admin/inline/Editable';
import { GroupCollections } from '@/components/groups/GroupCollections';
import { PageContainer } from '@/components/layout/PageContainer';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { HubNavBar } from '@/components/hub/HubNavBar';

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    groups, userGroups, isLoading, joinGroup, isJoining,
    requestJoin, isRequesting, leaveGroup, isLeaving,
  } = useGroups();
  const listedGroup = groups.find((item) => item.id === groupId);
  const membership = userGroups.find((item) => item.id === groupId);
  const group = listedGroup ?? membership;
  const listedRole = listedGroup && 'user_role' in listedGroup ? listedGroup.user_role : undefined;
  const role = typeof listedRole === 'string' ? listedRole : membership?.user_role;
  const pending = listedGroup?.has_pending_request;
  const canViewGroup = !!group && (!!user || (!group.is_private && !group.archived_at));
  const canViewEvents = !!user && !!group && (!group.is_private || !!group.is_member);
  const publicMeetup = usePublicGroupMeetup(groupId, !authLoading && !user && canViewGroup);
  const signInPath = `/auth?redirect=${encodeURIComponent(pathname)}`;

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
  } = useGroupPosts(user && group ? group.id : '');

  const {
    events,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
    createEvent,
    isCreatingEvent,
    joinEvent,
    isJoiningEvent,
    leaveEvent,
    isLeavingEvent,
    deleteEvent,
    isDeletingEvent,
  } = useGroupEvents(canViewEvents ? group.id : '');

  const [activeTab, setActiveTab] = useState('about');
  const [openedAt] = useState(Date.now);

  function openSection(tab: string, target = 'group-detail-sections') {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      const section = document.getElementById(target);
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: 'start' });
    });
  }

  function refreshGroup() {
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['user-groups'] });
  }

  if (authLoading || isLoading) {
    return (
      <>
        <HubNavBar />
        <PageContainer>
          <div className="animate-pulse flex flex-col gap-6">
            <div className="h-8 bg-muted rounded-element w-1/3" />
            <div className="h-32 bg-muted rounded-element" />
            <div className="h-64 bg-muted rounded-element" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (!user && !canViewGroup) {
    return (
      <>
        <HubNavBar />
        <PageContainer className="grid gap-4">
          <Alert>
            <AlertDescription>
              {t('pages.groupDetail.signInRequired', 'Please sign in to view group details.')}
            </AlertDescription>
          </Alert>
          <div>
            <Button asChild>
              <LocalizedLink to={signInPath}>{t('common.signIn', 'Sign in')}</LocalizedLink>
            </Button>
          </div>
        </PageContainer>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <HubNavBar />
        <PageContainer>
          <div className="text-center flex flex-col gap-4">
            <h1 className="text-2xl font-bold">Group not found</h1>
            <p className="text-muted-foreground">
              The group you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button asChild>
              <LocalizedLink to="/hub/groups">
                <ArrowLeft size={16} className="mr-2" />
                Back to Groups
              </LocalizedLink>
            </Button>
          </div>
        </PageContainer>
      </>
    );
  }

  const canManage = role === 'admin' || role === 'moderator';
  const meetup = canViewEvents
    ? events.find(
        (event) =>
          Date.parse(event.start_date) >= openedAt &&
          !['dead', 'cancelled', 'dead_link'].includes(event.liveness_status),
      )
    : !user ? publicMeetup.data : undefined;

  return (
    <>
      <HubNavBar />
      <PageContainer flush className="flex min-w-0 flex-col gap-6 pb-8 pt-4 md:pb-12">
        <header className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
          <div className="grid min-w-0 gap-4">
            <LocalizedLink
              to="/hub/groups"
              className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t('pages.groupDetail.opening.allGroups', 'All groups')}
            </LocalizedLink>
            <div className="flex min-w-0 items-start gap-4">
              <div className="w-16 shrink-0 sm:w-20">
                <Image
                  src={group.image_url}
                  alt=""
                  aspect="square"
                  imageRole="thumb"
                  rounded="element"
                  fallbackEntityType="default"
                  fallbackKey={group.id}
                  fallbackGlyph="community"
                />
              </div>
              <div className="min-w-0">
                <h1 className="break-words font-display text-headline leading-tight tracking-tight md:text-display">
                  <Editable
                    contentType="community_groups"
                    recordId={group.id}
                    field="name"
                    value={group.name}
                    onSaved={refreshGroup}
                  >
                    {group.name}
                  </Editable>
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {group.is_private ? <Lock size={14} aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
                    {group.is_private
                      ? t('pages.groupDetail.opening.privateGroup', 'Private group')
                      : t('pages.groupDetail.opening.publicGroup', 'Public group')}
                  </span>
                  <span>
                    {t('pages.groups.opening.memberCount', {
                      count: group.member_count,
                      defaultValue_one: '{{count}} member',
                      defaultValue_other: '{{count}} members',
                    })}
                  </span>
                  {group.city && <span>{group.city}</span>}
                </p>
              </div>
            </div>

            <Editable
              contentType="community_groups"
              recordId={group.id}
              field="description"
              value={group.description}
              onSaved={refreshGroup}
              fieldOverride={{ type: 'textarea' }}
              as="div"
            >
              <p className="max-w-reading whitespace-pre-line break-words text-pretty text-muted-foreground">
                {group.description?.trim() ||
                  t('pages.groupDetail.opening.noDescription', 'This group hasn’t added a description yet.')}
              </p>
            </Editable>

            <div className="flex flex-wrap items-center gap-2">
              {!user ? (
                <Button asChild>
                  <LocalizedLink to={signInPath}>
                    {t('pages.groups.opening.signIn', 'Sign in to join')}
                  </LocalizedLink>
                </Button>
              ) : group.is_member ? (
                <>
                  {group.chat_conversation_id ? (
                    <Button asChild>
                      <LocalizedLink to={`/hub/messages?filter=groups&conversation=${group.chat_conversation_id}`}>
                        <MessageSquare size={16} aria-hidden="true" />
                        {t('pages.groupDetail.opening.chat', 'Open group chat')}
                      </LocalizedLink>
                    </Button>
                  ) : (
                    <Button onClick={() => openSection('posts')}>
                      <MessageSquare size={16} aria-hidden="true" />
                      {t('pages.groupDetail.opening.discussion', 'See group discussions')}
                    </Button>
                  )}
                  <InviteFriendsDialog groupId={group.id} />
                </>
              ) : group.is_private ? (
                <Button
                  disabled={isRequesting || pending}
                  onClick={() => requestJoin({ groupId: group.id })}
                >
                  <Lock size={16} aria-hidden="true" />
                  {pending
                    ? t('pages.groupDetail.opening.requested', 'Request pending')
                    : isRequesting
                      ? t('pages.groupDetail.opening.requesting', 'Sending request…')
                      : t('pages.groupDetail.opening.request', 'Request to join')}
                </Button>
              ) : (
                <Button onClick={() => joinGroup(group.id)} disabled={isJoining}>
                  <UserPlus size={16} aria-hidden="true" />
                  {isJoining
                    ? t('pages.groupDetail.opening.joining', 'Joining…')
                    : t('pages.groupDetail.opening.join', 'Join group')}
                </Button>
              )}
            </div>
          </div>

          <div className="lg:mt-12">
            <GroupNextMeetup
              meetup={meetup}
              loading={user ? eventsLoading : publicMeetup.isLoading}
              error={user ? eventsError : publicMeetup.isError}
              onRetry={() => void (user ? refetchEvents() : publicMeetup.refetch())}
              emptyMessage={
                group.is_private && !group.is_member
                  ? t('pages.groupDetail.opening.memberMeetups', 'Meetups are visible to group members.')
                  : user
                    ? t('pages.groupDetail.opening.noMeetups', 'No upcoming meetups are listed yet.')
                    : t('pages.groupDetail.opening.noPublicMeetups', 'No upcoming public meetups are listed yet.')
              }
              eventPath={!user && publicMeetup.data ? `/events/${publicMeetup.data.slug || publicMeetup.data.id}` : undefined}
              onViewEvents={
                meetup && user
                  ? () => openSection('events', `group-event-${meetup.id}`)
                  : group.is_member
                    ? () => openSection('events')
                    : undefined
              }
            />
          </div>
        </header>

        {user && <Tabs
          id="group-detail-sections"
          tabIndex={-1}
          value={activeTab}
          onValueChange={setActiveTab}
          className="min-w-0 scroll-mt-28"
        >
          <TabsList aria-label={t('pages.groupDetail.sections', 'Group sections')} className="w-full">
            <TabsTrigger value="about" className="gap-2">
              <Scale size={16} aria-hidden="true" />
              {t('pages.groupDetail.rules', 'Rules')}
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users size={16} aria-hidden="true" />
              {t('pages.groupDetail.members', 'Members')}
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare size={16} aria-hidden="true" />
              {t('pages.groupDetail.chat', 'Chat')}
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-2">
              <MessageSquare size={16} aria-hidden="true" />
              {t('pages.groupDetail.posts', 'Posts')}
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <Calendar size={16} aria-hidden="true" />
              {t('pages.groupDetail.events', 'Events')}
            </TabsTrigger>
            <TabsTrigger value="collections" className="gap-2">
              <Folder size={16} aria-hidden="true" />
              {t('pages.groupDetail.collections', 'Collections')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="about"
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
          >
            {group.rules ? (
              <Card>
                <CardHeader>
                  <CardTitle>Group rules</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{group.rules}</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  This group has not set any rules.
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {group.tags?.map((tag) => (
                <LocalizedLink
                  key={tag}
                  to={`/tags/${encodeURIComponent(tag)}`}
                  className={badgeVariants({ variant: 'outline' })}
                >
                  {tag}
                </LocalizedLink>
              ))}
              {role && <Badge variant="secondary">{role}</Badge>}
              <span className="text-sm text-muted-foreground">
                {t('pages.groupDetail.opening.created', 'Created {{date}}', {
                  date: new Date(group.created_at).toLocaleDateString(),
                })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {group.is_member && (
                <Button onClick={() => leaveGroup(group.id)} disabled={isLeaving} variant="soft">
                  <UserMinus size={16} aria-hidden="true" />
                  {isLeaving
                    ? t('pages.groupDetail.opening.leaving', 'Leaving…')
                    : t('pages.groupDetail.opening.leave', 'Leave group')}
                </Button>
              )}
              {canManage && (
                <Button variant="soft" onClick={() => openSection('members')}>
                  <Settings size={16} aria-hidden="true" />
                  {t('pages.groupDetail.opening.manage', 'Manage group')}
                </Button>
              )}
              <AdminEditButton
                contentType="community_groups"
                contentId={group.id}
                contentName={group.name}
                currentData={group as unknown as Record<string, unknown>}
                size="default"
                exportable
              />
            </div>
          </TabsContent>

          <TabsContent
            value="members"
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Members ({group.member_count})</CardTitle>
                  {canManage && groupId && (
                    <AddMemberDialog
                      groupId={groupId}
                      existingMemberIds={groupMembers.map((m) => m.user_id)}
                      onMemberAdded={() =>
                        queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
                      }
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {groupMembers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No members yet.</p>
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
                    onMembersChanged={() =>
                      queryClient.invalidateQueries({ queryKey: ['group-members', groupId] })
                    }
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="chat"
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
          >
            <Card>
              <CardContent
                style={{ padding: '32px' }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <MessageSquare size={48} className="text-muted-foreground" />
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">Group chat lives in Messages</h3>
                  <p className="text-muted-foreground">
                    {group.is_member
                      ? 'This group has a shared conversation in your inbox.'
                      : 'Join the group to read and post in its chat.'}
                  </p>
                </div>
                {group.is_member && group.chat_conversation_id && (
                  <Button asChild>
                    <LocalizedLink
                      to={`/hub/messages?filter=groups&conversation=${group.chat_conversation_id}`}
                    >
                      Open group chat
                      <ArrowRight size={16} className="ml-2" aria-hidden />
                    </LocalizedLink>
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="posts"
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Group Posts</h3>
              {group.is_member && (
                <GroupPostDialog
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
                    <div className="h-32 bg-muted rounded-element" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <Card>
                <CardContent style={{ padding: '32px' }} className="text-center">
                  <MessageSquare
                    size={48}
                    style={{ margin: '0 auto 16px' }}
                    className="text-muted-foreground"
                  />
                  <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
                  <p className="text-muted-foreground mb-4">
                    {group.is_member
                      ? 'Be the first to start a conversation in this group!'
                      : 'Join the group to see and participate in discussions.'}
                  </p>
                  {group.is_member && (
                    <GroupPostDialog
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
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
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
                    <div className="h-48 bg-muted rounded-element" />
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <Card>
                <CardContent style={{ padding: '32px' }} className="text-center">
                  <Calendar
                    size={48}
                    style={{ margin: '0 auto 16px' }}
                    className="text-muted-foreground"
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
                  <div key={event.id} id={`group-event-${event.id}`} tabIndex={-1} className="scroll-mt-28">
                    <GroupEventCard
                      event={event}
                      onJoinEvent={joinEvent}
                      onLeaveEvent={leaveEvent}
                      onDeleteEvent={canManage ? deleteEvent : undefined}
                      isJoining={isJoiningEvent}
                      isLeaving={isLeavingEvent}
                      isDeleting={isDeletingEvent}
                      canManage={canManage}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="collections"
            style={{ flexDirection: 'column', gap: '24px' }}
            className="flex"
          >
            <GroupCollections groupId={groupId!} isMember={Boolean(group.is_member)} />
          </TabsContent>
        </Tabs>}
      </PageContainer>
    </>
  );
}
