import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type RelationshipType = 'friend' | 'block';
export type RelationshipStatus = 'pending' | 'accepted' | 'rejected';

export interface UserRelationship {
  id: string;
  user_id: string;
  target_user_id: string;
  relationship_type: RelationshipType;
  status: RelationshipStatus;
  created_at: string;
  updated_at: string;
}

export function useUserRelationships() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [relationships, setRelationships] = useState<UserRelationship[]>([]);

  // Fetch all relationships for the current user
  const fetchRelationships = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('*')
        .or(`user_id.eq.${user.id},target_user_id.eq.${user.id}`);

      if (error) throw error;
      setRelationships((data || []) as UserRelationship[]);
    } catch (error) {
      console.error('Error fetching relationships:', error);
      toast({
        title: "Error",
        description: "Failed to fetch relationships",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Add friend (send friend request)
  const addFriend = async (targetUserId: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('user_relationships')
        .insert({
          user_id: user.id,
          target_user_id: targetUserId,
          relationship_type: 'friend',
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Friend request sent!",
      });

      await fetchRelationships();
      return { error: null };
    } catch (error: unknown) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request",
        variant: "destructive",
      });
      return { error: error.message };
    }
  };

  // Block user
  const blockUser = async (targetUserId: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('user_relationships')
        .insert({
          user_id: user.id,
          target_user_id: targetUserId,
          relationship_type: 'block',
          status: 'accepted'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User blocked",
      });

      await fetchRelationships();
      return { error: null };
    } catch (error: unknown) {
      console.error('Error blocking user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to block user",
        variant: "destructive",
      });
      return { error: error.message };
    }
  };

  // Accept friend request
  const acceptFriendRequest = async (relationshipId: string) => {
    try {
      const { error } = await supabase
        .from('user_relationships')
        .update({ status: 'accepted' })
        .eq('id', relationshipId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Friend request accepted!",
      });

      await fetchRelationships();
      return { error: null };
    } catch (error: unknown) {
      console.error('Error accepting friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept friend request",
        variant: "destructive",
      });
      return { error: error.message };
    }
  };

  // Reject friend request
  const rejectFriendRequest = async (relationshipId: string) => {
    try {
      const { error } = await supabase
        .from('user_relationships')
        .update({ status: 'rejected' })
        .eq('id', relationshipId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Friend request rejected",
      });

      await fetchRelationships();
      return { error: null };
    } catch (error: unknown) {
      console.error('Error rejecting friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject friend request",
        variant: "destructive",
      });
      return { error: error.message };
    }
  };

  // Remove relationship (unfriend or unblock)
  const removeRelationship = async (targetUserId: string) => {
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error } = await supabase
        .from('user_relationships')
        .delete()
        .eq('user_id', user.id)
        .eq('target_user_id', targetUserId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Relationship removed",
      });

      await fetchRelationships();
      return { error: null };
    } catch (error: unknown) {
      console.error('Error removing relationship:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove relationship",
        variant: "destructive",
      });
      return { error: error.message };
    }
  };

  // Get relationship status with a specific user
  const getRelationshipStatus = (targetUserId: string) => {
    if (!user) return null;

    const sentRelationship = relationships.find(
      r => r.user_id === user.id && r.target_user_id === targetUserId
    );
    
    const receivedRelationship = relationships.find(
      r => r.user_id === targetUserId && r.target_user_id === user.id
    );

    if (sentRelationship) {
      return {
        type: sentRelationship.relationship_type,
        status: sentRelationship.status,
        direction: 'sent' as const,
        relationship: sentRelationship
      };
    }

    if (receivedRelationship) {
      return {
        type: receivedRelationship.relationship_type,
        status: receivedRelationship.status,
        direction: 'received' as const,
        relationship: receivedRelationship
      };
    }

    return null;
  };

  // Get friends list
  const getFriends = () => {
    if (!user) return [];
    
    return relationships.filter(r => 
      r.relationship_type === 'friend' && 
      r.status === 'accepted' &&
      (r.user_id === user.id || r.target_user_id === user.id)
    );
  };

  // Get pending friend requests (received)
  const getPendingRequests = () => {
    if (!user) return [];
    
    return relationships.filter(r => 
      r.relationship_type === 'friend' && 
      r.status === 'pending' &&
      r.target_user_id === user.id
    );
  };

  useEffect(() => {
    if (user) {
      fetchRelationships();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchRelationships defined above, re-run on user change
  }, [user]);

  return {
    relationships,
    loading,
    addFriend,
    blockUser,
    acceptFriendRequest,
    rejectFriendRequest,
    removeRelationship,
    getRelationshipStatus,
    getFriends,
    getPendingRequests,
    refetch: fetchRelationships
  };
}