import { Link, useNavigate } from 'react-router';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Clock, Check, X, Siren } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { useSOS } from '@/hooks/useSOS';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
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
  const navigate = useNavigate();
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
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, location')
        .in('user_id', friendIds);

      if (error) throw error;
      return data;
    },
    enabled: !!user && friends.length > 0,
  });

  const { data: requestProfiles } = useQuery({
    queryKey: ['request-profiles', pendingRequests.map((r) => r.user_id)],
    queryFn: async () => {
      if (!user || pendingRequests.length === 0) return [];

      const requestIds = pendingRequests.map((r) => r.user_id);
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, location')
        .in('user_id', requestIds);

      if (error) throw error;
      return data;
    },
    enabled: !!user && pendingRequests.length > 0,
  });

  return (
    <AuthGate title="Friends" description="Please sign in to view your friends.">
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <PageHeader
            title="Friends"
            subtitle="Manage your connections"
            actions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Users style={{ width: 16, height: 16 }} />
                    {friends.length} Friends
                  </Box>
                </Badge>
              </Box>
            }
          />

          <Tabs defaultValue="friends" style={{ width: '100%' }}>
            <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr' }}>
              <TabsTrigger value="friends">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Users style={{ width: 16, height: 16 }} />
                  Friends ({friends.length})
                </Box>
              </TabsTrigger>
              <TabsTrigger value="requests">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Clock style={{ width: 16, height: 16 }} />
                  Requests ({pendingRequests.length})
                </Box>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="friends">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                  <Box sx={{ display: 'grid', gap: 2 }}>
                    {friends.map((friendship) => {
                      const friendId =
                        friendship.user_id === user!.id
                          ? friendship.target_user_id
                          : friendship.user_id;
                      const profile = friendProfiles?.find((p) => p.user_id === friendId);

                      return (
                        <Card key={friendship.id}>
                          <CardContent sx={{ p: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar style={{ width: 48, height: 48 }}>
                                  <AvatarImage src={profile?.avatar_url || undefined} />
                                  <AvatarFallback>
                                    {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <Box>
                                  <Link
                                    to={`/users/${friendId}`}
                                    style={{ fontWeight: 500, transition: 'color 0.2s' }}
                                  >
                                    {profile?.display_name || 'Unknown User'}
                                  </Link>
                                  {profile?.location && (
                                    <Typography variant="body2" color="text.secondary">
                                      {profile.location}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1 }}>
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
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </TabsContent>

            <TabsContent value="requests">
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {pendingRequests.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Your circle is just getting started"
                    description="Find people to connect with."
                    mood="encouraging"
                  />
                ) : (
                  <Box sx={{ display: 'grid', gap: 2 }}>
                    {pendingRequests.map((request) => {
                      const profile = requestProfiles?.find((p) => p.user_id === request.user_id);

                      return (
                        <Card key={request.id}>
                          <CardContent sx={{ p: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar style={{ width: 48, height: 48 }}>
                                  <AvatarImage src={profile?.avatar_url || undefined} />
                                  <AvatarFallback>
                                    {profile?.display_name?.charAt(0)?.toUpperCase() || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <Box>
                                  <Link
                                    to={`/users/${request.user_id}`}
                                    style={{ fontWeight: 500, transition: 'color 0.2s' }}
                                  >
                                    {profile?.display_name || 'Unknown User'}
                                  </Link>
                                  <Typography variant="body2" color="text.secondary">
                                    Sent you a friend request
                                  </Typography>
                                  {profile?.location && (
                                    <Typography variant="body2" color="text.secondary">
                                      {profile.location}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => acceptFriendRequest(request.id)}
                                  disabled={loading}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Check style={{ width: 16, height: 16 }} />
                                    Accept
                                  </Box>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => rejectFriendRequest(request.id)}
                                  disabled={loading}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <X style={{ width: 16, height: 16 }} />
                                    Decline
                                  </Box>
                                </Button>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </TabsContent>
          </Tabs>
        </Box>
      </Container>
    </AuthGate>
  );
}
