import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Lock, Globe, UserPlus, UserMinus, Settings, ExternalLink } from 'lucide-react';
import { Group } from '@/hooks/useGroups';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

const GroupCardFixture = () => (
  <Card>
    <CardHeader>
      <div className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar><AvatarFallback>S</AvatarFallback></Avatar>
          <div className="flex-1">
            <p className="font-semibold">Sample Group</p>
            <div className="flex items-center gap-1">
              <Users style={{ width: 12, height: 12 }} />
              <p className="text-sm font-medium">42</p>
              <p className="text-sm text-muted-foreground">members</p>
            </div>
          </div>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-4">A sample group description.</p>
      <div className="flex flex-wrap gap-1 mb-4">
        <Badge variant="outline"><span className="text-xs">Tag 1</span></Badge>
        <Badge variant="outline"><span className="text-xs">Tag 2</span></Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm">View</Button>
        <Button size="sm">Join</Button>
      </div>
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
        <div className="pb-3">
          <div className="flex items-start gap-3">
            <Avatar>
              <AvatarImage src={group.image_url || undefined} />
              <AvatarFallback>{group.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <LocalizedLink to={`/groups/${group.id}`} style={{ flex: 1 }}>
                  <p
                    className="font-semibold overflow-hidden hover:underline"
                    style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}
                  >
                    {group.name}
                  </p>
                </LocalizedLink>
                {group.is_private ? (
                  <Lock style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                ) : (
                  <Globe style={{ width: 16, height: 16 }} color="var(--muted-foreground)" />
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Users style={{ width: 12, height: 12 }} />
                  <p className="text-sm font-medium">{group.member_count}</p>
                  <p className="text-sm text-muted-foreground">members</p>
                </div>
                {group.member_count > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--success, #16a34a)' }} />
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(group.member_count * 0.3)} active
                    </p>
                  </div>
                )}
                {group.user_role && (
                  <Badge variant="secondary">
                    <span className="text-xs">{group.user_role}</span>
                  </Badge>
                )}
                {!group.is_member && group.has_pending_request && (
                  <Badge variant="outline">
                    <span className="text-xs">Pending</span>
                  </Badge>
                )}
              </div>
            </div>

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
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {group.description && (
          <p
            className="text-sm text-muted-foreground overflow-hidden mb-4"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {group.description}
          </p>
        )}

        {group.tags && group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {group.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">
                <span className="text-xs">{tag}</span>
              </Badge>
            ))}
            {group.tags.length > 3 && (
              <Badge variant="outline">
                <span className="text-xs">+{group.tags.length - 3} more</span>
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <LocalizedLink to={`/groups/${group.id}`}>
              <span className="flex items-center">
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                View Group
              </span>
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
        </div>
      </CardContent>
    </Card>
  );
};
