import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Crown, Shield, User, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { SocialLinksDisplay } from '@/components/profile/SocialLinksDisplay';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface GroupMember {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    display_name: string;
    avatar_url: string;
    social_links?: Record<string, any>;
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {members.map((member) => (
        <Card key={member.user_id}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar>
                  <AvatarImage src={member.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {member.profiles.display_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {member.profiles.display_name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Badge variant={getRoleColor(member.role) as any}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {getRoleIcon(member.role)}
                        {member.role}
                      </Box>
                    </Badge>
                    <Typography variant="caption" color="text.secondary">
                      Joined {new Date(member.joined_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                  {member.profiles.social_links && Object.keys(member.profiles.social_links).length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <SocialLinksDisplay
                        socialLinks={member.profiles.social_links}
                        size="sm"
                      />
                    </Box>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
