import { Button } from '@/components/ui/button';
import { UserPlus, UserMinus, Shield, ShieldCheck, Check, X } from 'lucide-react';
import { useUserRelationships } from '@/hooks/useUserRelationships';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Box from '@mui/material/Box';

interface UserRelationshipActionsProps {
  targetUserId: string;
  compact?: boolean;
}

export function UserRelationshipActions({ targetUserId, compact = false }: UserRelationshipActionsProps) {
  const { user } = useAuth();
  const {
    addFriend,
    blockUser,
    removeRelationship,
    acceptFriendRequest,
    rejectFriendRequest,
    getRelationshipStatus,
    loading
  } = useUserRelationships();

  // Don't show actions for the current user
  if (!user || user.id === targetUserId) {
    return null;
  }

  const relationshipStatus = getRelationshipStatus(targetUserId);

  const handleAddFriend = () => addFriend(targetUserId);
  const handleBlock = () => blockUser(targetUserId);
  const handleRemove = () => removeRelationship(targetUserId);
  const handleAccept = () => relationshipStatus?.relationship && acceptFriendRequest(relationshipStatus.relationship.id);
  const handleReject = () => relationshipStatus?.relationship && rejectFriendRequest(relationshipStatus.relationship.id);

  // If user is blocked, show unblock option
  if (relationshipStatus?.type === 'block' && relationshipStatus.direction === 'sent') {
    return (
      <Button
        variant="destructive"
        size={compact ? "sm" : "default"}
        onClick={handleRemove}
        disabled={loading}

      >
        <ShieldCheck style={{ height: 16, width: 16 }} />
        Unblock
      </Button>
    );
  }

  // If there's a pending friend request sent by current user
  if (relationshipStatus?.type === 'friend' && relationshipStatus.direction === 'sent' && relationshipStatus.status === 'pending') {
    return (
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={handleRemove}
        disabled={loading}

      >
        <UserMinus style={{ height: 16, width: 16 }} />
        Cancel Request
      </Button>
    );
  }

  // If there's a pending friend request received by current user
  if (relationshipStatus?.type === 'friend' && relationshipStatus.direction === 'received' && relationshipStatus.status === 'pending') {
    if (compact) {
      return (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            variant="default"
            size="sm"
            onClick={handleAccept}
            disabled={loading}
          >
            <Check style={{ height: 16, width: 16 }} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReject}
            disabled={loading}
          >
            <X style={{ height: 16, width: 16 }} />
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="default"
          onClick={handleAccept}
          disabled={loading}

        >
          <Check style={{ height: 16, width: 16 }} />
          Accept
        </Button>
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={loading}

        >
          <X style={{ height: 16, width: 16 }} />
          Reject
        </Button>
      </Box>
    );
  }

  // If users are friends
  if (relationshipStatus?.type === 'friend' && relationshipStatus.status === 'accepted') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            disabled={loading}

          >
            <UserMinus style={{ height: 16, width: 16 }} />
            Friends
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={handleRemove}>
            <UserMinus style={{ height: 16, width: 16, marginRight: 8 }} />
            Unfriend
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleBlock}>
            <Shield style={{ height: 16, width: 16, marginRight: 8 }} />
            Block
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default state - no relationship exists
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size={compact ? "sm" : "default"}
          disabled={loading}

        >
          <UserPlus style={{ height: 16, width: 16 }} />
          Add Friend
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleAddFriend}>
          <UserPlus style={{ height: 16, width: 16, marginRight: 8 }} />
          Send Friend Request
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleBlock}>
          <Shield style={{ height: 16, width: 16, marginRight: 8 }} />
          Block User
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
