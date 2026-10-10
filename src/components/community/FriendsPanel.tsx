import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Clock, Check, X, Siren, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchProfilesByUserIds } from '@/hooks/usePageFetchers';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { useSOS } from '@/hooks/useSOS';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PeopleModeView } from '@/pages/people/PeopleModeView';
import { MeetMembersNotice } from '@/components/people/MeetMembersNotice';

interface FriendProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
}

/**
 * Friends + pending-requests management (accept/reject/remove), SOS, and
 * start-conversation — the reusable body of the /hub/friends page,
 * also embedded in the /hub Contacts module. Assumes a signed-in user
 * (callers wrap in AuthGate). No page chrome — the container supplies it.
 */
export function FriendsPanel() {
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const {
    acceptFriendRequest,
    rejectFriendRequest,
    removeRelationship,
    getFriends,
    getPendingRequests,
    getSentRequests,
    loading,
    hasLoaded,
    error,
    refetch,
  } = useUserRelationships();

  const friends = getFriends();
  const pendingRequests = getPendingRequests();
  const sentRequests = getSentRequests();

  const friendIds = user
    ? friends.map((f) => (f.user_id === user.id ? f.target_user_id : f.user_id))
    : [];
  const { sendSOS, canSend, loading: sosLoading, cooldownSeconds, friendCount } = useSOS(friendIds);

  const { data: friendProfiles } = useQuery({
    queryKey: [
      'friend-profiles',
      friends.map((f) => (f.user_id === user?.id ? f.target_user_id : f.user_id)),
    ],
    queryFn: async () => {
      if (!user || friends.length === 0) return [];
      const ids = friends.map((f) => (f.user_id === user.id ? f.target_user_id : f.user_id));
      return fetchProfilesByUserIds<FriendProfile>(ids);
    },
    enabled: !!user && friends.length > 0,
  });

  const { data: requestProfiles } = useQuery({
    queryKey: ['request-profiles', pendingRequests.map((r) => r.user_id)],
    queryFn: async () => {
      if (!user || pendingRequests.length === 0) return [];
      return fetchProfilesByUserIds<FriendProfile>(pendingRequests.map((r) => r.user_id));
    },
    enabled: !!user && pendingRequests.length > 0,
  });

  const { data: sentProfiles } = useQuery({
    queryKey: ['sent-request-profiles', sentRequests.map((r) => r.target_user_id)],
    queryFn: async () => {
      if (!user || sentRequests.length === 0) return [];
      return fetchProfilesByUserIds<FriendProfile>(sentRequests.map((r) => r.target_user_id));
    },
    enabled: !!user && sentRequests.length > 0,
  });

  // Before the first fetch settles, and after a failed one, the lists are
  // empty for reasons that have nothing to do with the user's circle — so
  // neither state may render the "no friends yet" empty state.
  const status: 'loading' | 'error' | 'ready' = error ? 'error' : hasLoaded ? 'ready' : 'loading';

  const loadingState = (
    <div className="grid gap-4" aria-busy="true">
      <Skeleton height={80} />
      <Skeleton height={80} />
    </div>
  );
  const errorState = (
    <ErrorState
      title={t('pages.friends.loadError', 'Could not load your friends.')}
      onRetry={() => void refetch()}
    />
  );
  const requestCount = pendingRequests.length + sentRequests.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canSend || sosLoading}
              className="gap-1.5"
            >
              <Siren size={16} />
              {cooldownSeconds > 0
                ? `${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, '0')}`
                : t('sos.button')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('sos.confirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('sos.confirmBody', { count: friendCount })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={sendSOS}
                className="bg-destructive text-destructive-foreground"
              >
                <Siren size={16} className="mr-1.5" />
                {sosLoading ? t('sos.sending') : t('sos.send')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Badge variant="secondary" className="border-0">
          <div className="flex items-center gap-2">
            <Users size={16} />
            {friends.length} {t('pages.friends.title', 'Friends')}
          </div>
        </Badge>
      </div>

      <Tabs defaultValue="friends" style={{ width: '100%' }}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="friends">
            <div className="flex items-center gap-2">
              <Users size={16} />
              {t('pages.friends.title', 'Friends')} ({friends.length})
            </div>
          </TabsTrigger>
          <TabsTrigger value="requests">
            <div className="flex items-center gap-2">
              <Clock size={16} />
              {t('pages.friends.requests', 'Requests')} ({requestCount})
            </div>
          </TabsTrigger>
          <TabsTrigger value="discover">
            <div className="flex items-center gap-2">
              <UserPlus size={16} />
              {t('people.friends.discover', 'Find people')}
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends">
          <div className="flex flex-col gap-4">
            {status === 'loading' ? (
              loadingState
            ) : status === 'error' ? (
              errorState
            ) : friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t('pages.friends.empty.title', 'No friends yet.')}
                description={
                  sentRequests.length > 0
                    ? t('pages.friends.empty.pendingSent', {
                        count: sentRequests.length,
                        defaultValue:
                          'You have {{count}} sent requests waiting for an answer. See the Requests tab.',
                      })
                    : t('pages.friends.empty.description', 'Find people to connect with.')
                }
                mood="encouraging"
                primaryAction={{
                  label: t('pages.friends.empty.cta', 'Find people'),
                  onClick: () => navigate('/hub/members'),
                }}
              />
            ) : (
              <div className="grid gap-4">
                {friends.map((friendship) => {
                  const friendId =
                    friendship.user_id === user!.id
                      ? friendship.target_user_id
                      : friendship.user_id;
                  const profile = friendProfiles?.find((p) => p.user_id === friendId);
                  return (
                    <Card key={friendship.id}>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar style={{ width: 48, height: 48 }}>
                              <AvatarImage
                                src={profile?.avatar_url || undefined}
                                alt={profile?.display_name || ''}
                              />
                              <AvatarFallback>
                                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <LocalizedLink to={`/user/${friendId}`} className="font-medium">
                                {profile?.display_name || 'Unknown User'}
                              </LocalizedLink>
                              {profile?.location && (
                                <p className="text-sm text-muted-foreground">{profile.location}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <StartConversationButton
                              userId={friendId}
                              userName={profile?.display_name || 'User'}
                              variant="soft"
                              size="sm"
                            />
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => removeRelationship(friendId)}
                              disabled={loading}
                            >
                              {t('common.remove', 'Remove')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests">
          <div className="flex flex-col gap-4">
            {status === 'loading' ? (
              loadingState
            ) : status === 'error' ? (
              errorState
            ) : requestCount === 0 ? (
              <EmptyState
                icon={Clock}
                title={t('pages.friends.requestsEmpty', 'No open friend requests.')}
                description={t('pages.friends.empty.description', 'Find people to connect with.')}
              />
            ) : (
              <div className="grid gap-4">
                {pendingRequests.length > 0 && sentRequests.length > 0 && (
                  <h3 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t('pages.friends.received', 'Received')}
                  </h3>
                )}
                {pendingRequests.map((request) => {
                  const profile = requestProfiles?.find((p) => p.user_id === request.user_id);
                  return (
                    <Card key={request.id}>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar style={{ width: 48, height: 48 }}>
                              <AvatarImage
                                src={profile?.avatar_url || undefined}
                                alt={profile?.display_name || ''}
                              />
                              <AvatarFallback>
                                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <LocalizedLink
                                to={`/user/${request.user_id}`}
                                className="font-medium"
                              >
                                {profile?.display_name || 'Unknown User'}
                              </LocalizedLink>
                              <p className="text-sm text-muted-foreground">
                                {t('pages.friends.sentRequest', 'Sent you a friend request')}
                              </p>
                              {profile?.location && (
                                <p className="text-sm text-muted-foreground">{profile.location}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => acceptFriendRequest(request.id)}
                              disabled={loading}
                            >
                              <div className="flex items-center gap-2">
                                <Check size={16} />
                                {t('common.accept', 'Accept')}
                              </div>
                            </Button>
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => rejectFriendRequest(request.id)}
                              disabled={loading}
                            >
                              <div className="flex items-center gap-2">
                                <X size={16} />
                                {t('common.decline', 'Decline')}
                              </div>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {sentRequests.length > 0 && (
                  <h3 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t('pages.friends.sent', 'Sent')}
                  </h3>
                )}
                {sentRequests.map((request) => {
                  const profile = sentProfiles?.find((p) => p.user_id === request.target_user_id);
                  return (
                    <Card key={request.id}>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar style={{ width: 48, height: 48 }}>
                              <AvatarImage
                                src={profile?.avatar_url || undefined}
                                alt={profile?.display_name || ''}
                              />
                              <AvatarFallback>
                                {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <LocalizedLink
                                to={`/user/${request.target_user_id}`}
                                className="font-medium"
                              >
                                {profile?.display_name || 'Unknown User'}
                              </LocalizedLink>
                              <p className="text-sm text-muted-foreground">
                                {t('pages.friends.waitingForAnswer', 'Waiting for an answer')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {t('pages.friends.pendingBadge', 'Pending')}
                            </Badge>
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => removeRelationship(request.target_user_id)}
                              disabled={loading}
                            >
                              {t('pages.friends.cancelRequest', 'Withdraw')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="discover">
          <PeopleModeView mode="friends" emptyState={<MeetMembersNotice />} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
