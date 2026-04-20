import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Lock, Globe, UserPlus, UserMinus, Settings, ExternalLink } from 'lucide-react';
import { Group } from '@/hooks/useGroups';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

const GroupCardFixture = () => (
  <Card>
    <CardHeader>
      <Box sx={{ pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Avatar><AvatarFallback>S</AvatarFallback></Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Sample Group</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Users style={{ width: 12, height: 12 }} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>42</Typography>
              <Typography variant="body2" color="text.secondary">members</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </CardHeader>
    <CardContent>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>A sample group description.</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
        <Badge variant="outline"><Typography variant="caption">Tag 1</Typography></Badge>
        <Badge variant="outline"><Typography variant="caption">Tag 2</Typography></Badge>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="ghost" size="sm">View</Button>
        <Button size="sm">Join</Button>
      </Box>
    </CardContent>
  </Card>
);

interface GroupCardProps {
  group?: Group;
  loading?: boolean;
  onJoin?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  onRequestJoin?: (groupId: string) => void;
  onManage?: (group: Group) => void;
  isJoining?: boolean;
  isLeaving?: boolean;
  isRequesting?: boolean;
}

export const GroupCard = ({
  group,
  loading = false,
  onJoin,
  onLeave,
  onRequestJoin,
  onManage,
  isJoining,
  isLeaving,
  isRequesting,
}: GroupCardProps) => {
  if (loading || !group) {
    return (
      <Skeleton name="group-card" loading={true} fixture={<GroupCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <Card>
      <CardHeader>
        <Box sx={{ pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Avatar>
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback>{group.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <LocalizedLink to={`/groups/${group.id}`} style={{ flex: 1 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {group.name}
                  </Typography>
                </LocalizedLink>
                {group.is_private ? (
                  <Lock style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                ) : (
                  <Globe style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Users style={{ width: 12, height: 12 }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {group.member_count}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    members
                  </Typography>
                </Box>
                {group.member_count > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        bgcolor: 'success.main',
                        borderRadius: '50%',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {Math.floor(group.member_count * 0.3)} active
                    </Typography>
                  </Box>
                )}
                {group.user_role && (
                  <Badge variant="secondary">
                    <Typography variant="caption">{group.user_role}</Typography>
                  </Badge>
                )}
                {!group.is_member && group.has_pending_request && (
                  <Badge variant="outline">
                    <Typography variant="caption">Pending</Typography>
                  </Badge>
                )}
              </Box>
            </Box>

            {canManage && onManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onManage(group)}
                aria-label="Manage group settings"

              >
                <Settings style={{ width: 16, height: 16 }} />
              </Button>
            )}
          </Box>
        </Box>
      </CardHeader>

      <CardContent>
        {group.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              mb: 2,
            }}
          >
            {group.description}
          </Typography>
        )}

        {group.tags && group.tags.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
            {group.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">
                <Typography variant="caption">{tag}</Typography>
              </Badge>
            ))}
            {group.tags.length > 3 && (
              <Badge variant="outline">
                <Typography variant="caption">+{group.tags.length - 3} more</Typography>
              </Badge>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button asChild variant="ghost" size="sm">
            <LocalizedLink to={`/groups/${group.id}`}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                View Group
              </Box>
            </LocalizedLink>
          </Button>

          {!group.is_member ? (
            group.is_private ? (
              group.has_pending_request ? (
                <Button disabled variant="outline" size="sm">
                  <Lock style={{ width: 16, height: 16, marginRight: 8 }} />
                  Requested
                </Button>
              ) : (
                <Button
                  onClick={() => onRequestJoin?.(group.id)}
                  disabled={isRequesting}
                  size="sm"
                >
                  <UserPlus style={{ width: 16, height: 16, marginRight: 8 }} />
                  {isRequesting ? 'Requesting...' : 'Request to Join'}
                </Button>
              )
            ) : (
              <Button
                onClick={() => onJoin?.(group.id)}
                disabled={isJoining}
                size="sm"
              >
                <UserPlus style={{ width: 16, height: 16, marginRight: 8 }} />
                {isJoining ? 'Joining...' : 'Join'}
              </Button>
            )
          ) : (
            <Button
              onClick={() => onLeave?.(group.id)}
              disabled={isLeaving}
              variant="outline"
              size="sm"

            >
              <UserMinus style={{ width: 16, height: 16, marginRight: 8 }} />
              {isLeaving ? 'Leaving...' : 'Leave'}
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
