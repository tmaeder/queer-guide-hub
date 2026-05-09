import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, Shield, User, MessageSquare, MoreVertical, UserMinus, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

interface GroupMember {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    display_name: string;
    avatar_url: string;
    social_links?: Record<string, unknown>;
  };
}

interface GroupMembersListProps {
  members: GroupMember[];
  canManage: boolean;
  groupId?: string;
  onStartConversation?: (userId: string) => void;
  onMembersChanged?: () => void;
}

export function GroupMembersList({ members, canManage, groupId, onStartConversation, onMembersChanged }: GroupMembersListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown style={{ width: 12, height: 12 }} />;
      case 'moderator':
        return <Shield style={{ width: 12, height: 12 }} />;
      default:
        return <User style={{ width: 12, height: 12 }} />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'moderator':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const handleRoleChange = async (member: GroupMember) => {
    if (!groupId) return;
    const newRole = member.role === 'moderator' ? 'member' : 'moderator';
    const { error } = await supabase
      .from('group_memberships')
      .update({ role: newRole })
      .eq('group_id', groupId)
      .eq('user_id', member.user_id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Role updated', description: `${member.profiles.display_name} is now ${newRole}.` });
    onMembersChanged?.();
  };

  const handleRemove = async (member: GroupMember) => {
    if (!groupId) return;
    const { error } = await supabase
      .from('group_memberships')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', member.user_id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Member removed', description: `${member.profiles.display_name} removed from group.` });
      onMembersChanged?.();
    }
    setRemovingId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {members.map((member) => (
        <Card key={member.user_id}>
          <CardContent>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={member.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {member.profiles.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    {member.profiles.display_name}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant={getRoleColor(member.role) as 'default' | 'secondary' | 'destructive' | 'outline'}>
                      <span className="flex items-center gap-1">
                        {getRoleIcon(member.role)}
                        {member.role}
                      </span>
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </span>
                  </div>
                  {member.profiles.social_links && Object.keys(member.profiles.social_links).length > 0 && (
                    <div className="mt-2">
                      <SocialLinksDisplay
                        socialLinks={member.profiles.social_links}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {member.user_id !== user?.id && onStartConversation && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStartConversation(member.user_id)}
                  >
                    <MessageSquare style={{ width: 16, height: 16, marginRight: 8 }} />
                    Message
                  </Button>
                )}

                {canManage && groupId && member.role !== 'admin' && member.user_id !== user?.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreVertical style={{ width: 16, height: 16 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleRoleChange(member)}>
                        <ArrowUpDown style={{ width: 16, height: 16, marginRight: 8 }} />
                        {member.role === 'moderator' ? 'Demote to Member' : 'Promote to Moderator'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setRemovingId(member.user_id)}
                        className="text-destructive"
                      >
                        <UserMinus style={{ width: 16, height: 16, marginRight: 8 }} />
                        Remove from Group
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!removingId} onOpenChange={(open) => !open && setRemovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this member from the group? They can rejoin later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const member = members.find(m => m.user_id === removingId);
                if (member) handleRemove(member);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
