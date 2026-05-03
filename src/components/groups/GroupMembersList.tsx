import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, Shield, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';

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
  onStartConversation?: (userId: string) => void;
}

export function GroupMembersList({ members, canManage, onStartConversation }: GroupMembersListProps) {
  const { user } = useAuth();

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

                {canManage && member.role !== 'admin' && member.user_id !== user?.id && (
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
