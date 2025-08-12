import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, UserPlus, Clock, Check, X, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';

export default function Friends() {
  const { user } = useAuth();
  const {
    acceptFriendRequest,
    rejectFriendRequest,
    removeRelationship,
    getFriends,
    getPendingRequests,
    loading
  } = useUserRelationships();

  const friends = getFriends();
  const pendingRequests = getPendingRequests();

  // Fetch profile data for friends and pending requests
  const { data: friendProfiles } = useQuery({
    queryKey: ['friend-profiles', friends.map(f => f.user_id === user?.id ? f.target_user_id : f.user_id)],
    queryFn: async () => {
      if (!user || friends.length === 0) return [];
      
      const friendIds = friends.map(f => f.user_id === user.id ? f.target_user_id : f.user_id);
      const { data, error } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, avatar_url, location')
        .in('user_id', friendIds);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && friends.length > 0
  });

  const { data: requestProfiles } = useQuery({
    queryKey: ['request-profiles', pendingRequests.map(r => r.user_id)],
    queryFn: async () => {
      if (!user || pendingRequests.length === 0) return [];
      
      const requestIds = pendingRequests.map(r => r.user_id);
      const { data, error } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, avatar_url, location')
        .in('user_id', requestIds);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && pendingRequests.length > 0
  });

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Please log in to view your friends.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Friends</h1>
          <p className="text-muted-foreground">Manage your connections</p>
        </div>
        <Badge variant="secondary" className="gap-2">
          <Users className="h-4 w-4" />
          {friends.length} Friends
        </Badge>
      </div>

      <Tabs defaultValue="friends" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="friends" className="gap-2">
            <Users className="h-4 w-4" />
            Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <Clock className="h-4 w-4" />
            Requests ({pendingRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="space-y-4">
          {friends.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No friends yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start connecting with people in your community
                </p>
                <Button asChild>
                  <Link to="/users">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Find People
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {friends.map((friendship) => {
                const friendId = friendship.user_id === user.id ? friendship.target_user_id : friendship.user_id;
                const profile = friendProfiles?.find(p => p.user_id === friendId);
                
                return (
                  <Card key={friendship.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={profile?.avatar_url || undefined} />
                            <AvatarFallback>
                              {profile?.display_name?.charAt(0)?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link 
                              to={`/users/${friendId}`}
                              className="font-medium hover:text-primary"
                            >
                              {profile?.display_name || "Unknown User"}
                            </Link>
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
                            userName={profile?.display_name || "User"}
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
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No pending requests</h3>
                <p className="text-muted-foreground">
                  Friend requests will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingRequests.map((request) => {
                const profile = requestProfiles?.find(p => p.user_id === request.user_id);
                
                return (
                  <Card key={request.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={profile?.avatar_url || undefined} />
                            <AvatarFallback>
                              {profile?.display_name?.charAt(0)?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link 
                              to={`/users/${request.user_id}`}
                              className="font-medium hover:text-primary"
                            >
                              {profile?.display_name || "Unknown User"}
                            </Link>
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
                            className="gap-2"
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => rejectFriendRequest(request.id)}
                            disabled={loading}
                            className="gap-2"
                          >
                            <X className="h-4 w-4" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}