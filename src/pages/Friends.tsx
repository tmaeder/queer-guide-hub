import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Clock, Check, X, Siren } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchProfilesByUserIds } from '@/hooks/usePageFetchers';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { useSOS } from '@/hooks/useSOS';
import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
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

export default function Friends() {
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const {
    acceptFriendRequest,
    rejectFriendRequest,
    removeRelationship,
    getFriends,
    getPendingRequests,
    loading,
  } = useUserRelationships();

  const friends = getFriends();
  const pendingRequests = getPendingRequests();

  const friendIds = user
    ? friends.map((f) => (f.user_id === user.id ? f.target_user_id : f.user_id))
    : [];
  const { sendSOS, canSend, loading: sosLoading, cooldownSeconds, friendCount } = useSOS(friendIds);

  // Fetch profile data for friends and pending requests
  const { data: friendProfiles } = useQuery({
    queryKey: [
      'friend-profiles',
      friends.map((f) => (f.user_id === user?.id ? f.target_user_id : f.user_id)),
    ],
    queryFn: async () => {
      if (!user || friends.length === 0) return [];
      const friendIds = friends.map((f) => (f.user_id === user.id ? f.target_user_id : f.user_id));
      return fetchProfilesByUserIds(friendIds);
    },
    enabled: !!user && friends.length > 0,
  });

  const { data: requestProfiles } = useQuery({
    queryKey: ['request-profiles', pendingRequests.map((r) => r.user_id)],
    queryFn: async () => {
      if (!user || pendingRequests.length === 0) return [];
      return fetchProfilesByUserIds(pendingRequests.map((r) => r.user_id));
    },
    enabled: !!user && pendingRequests.length > 0,
  });

  return (
    <AuthGate title="Friends" description="Please sign in to view your friends.">
      <div className="container mx-auto py-6 px-4">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Friends"
            subtitle="Manage your connections"
            actions={
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!canSend || sosLoading}
                      style={{ gap: 6 }}
                    >
                      <Siren style={{ width: 16, height: 16 }} />
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
                        style={{ backgroundColor: '#DC2626' }}
                      >
                        <Siren style={{ width: 16, height: 16, marginRight: 6 }} />
                        {sosLoading ? t('sos.sending') : t('sos.send')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Badge variant="secondary">
                  <div className="flex items-center gap-2">
                    <Users style={{ width: 16, height: 16 }} />
                    {friends.length} Friends
                  </div>
                </Badge>
              </div>
            }
          />

          <Tabs defaultValue="friends" style={{ width: '100%' }}>
            <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
              <TabsTrigger value="friends">
                <div className="flex items-center gap-2">
                  <Users style={{ width: 16, height: 16 }} />
                  Friends ({friends.length})
                </div>
              </TabsTrigger>
              <TabsTrigger value="requests">
                <div className="flex items-center gap-2">
                  <Clock style={{ width: 16, height: 16 }} />
                  Requests ({pendingRequests.length})
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends">
              <div className="flex flex-col gap-4">
                {friends.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="Your circle is just getting started"
                    description="Find people to connect with."
                    mood="encouraging"
                    primaryAction={{
                      label: 'Find People',
                      onClick: () => navigate('/users'),
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
                              <div className="flex items-center gap-3">
                                <Avatar style={{ width: 48, height: 48 }}>
                                  <AvatarImage src={profile?.avatar_url || undefined} />
                                  <AvatarFallback>
                                    {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <LocalizedLink
                                    to={`/users/${friendId}`}
                                    style={{ fontWeight: 500, transition: 'color 0.2s' }}
                                  >
                                    {profile?.display_name || 'Unknown User'}
                                  </LocalizedLink>
                                  {profile?.location && (
                                    <p className="text-sm text-muted-foreground">
                                      {profile.location}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <StartConversationButton
                                  userId={friendId}
                                  userName={profile?.display_name || 'User'}
                                  variant="outline"
                                  size="sm"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => removeRelationship(friendId)}
                                  disabled={loading}
                                >
                                  Remove
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
                {pendingRequests.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Your circle is just getting started"
                    description="Find people to connect with."
                    mood="encouraging"
                  />
                ) : (
                  <div className="grid gap-4">
                    {pendingRequests.map((request) => {
                      const profile = requestProfiles?.find((p) => p.user_id === request.user_id);

                      return (
                        <Card key={request.id}>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Avatar style={{ width: 48, height: 48 }}>
                                  <AvatarImage src={profile?.avatar_url || undefined} />
                                  <AvatarFallback>
                                    {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <LocalizedLink
                                    to={`/users/${request.user_id}`}
                                    style={{ fontWeight: 500, transition: 'color 0.2s' }}
                                  >
                                    {profile?.display_name || 'Unknown User'}
                                  </LocalizedLink>
                                  <p className="text-sm text-muted-foreground">
                                    Sent you a friend request
                                  </p>
                                  {profile?.location && (
                                    <p className="text-sm text-muted-foreground">
                                      {profile.location}
                                    </p>
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
                                    <Check style={{ width: 16, height: 16 }} />
                                    Accept
                                  </div>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => rejectFriendRequest(request.id)}
                                  disabled={loading}
                                >
                                  <div className="flex items-center gap-2">
                                    <X style={{ width: 16, height: 16 }} />
                                    Decline
                                  </div>
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
          </Tabs>
        </div>
      </div>
    </AuthGate>
  );
}
