import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Image } from '@/components/ui/Image';
import { StationBadge } from '@/components/ui/StationBadge';
import {
  Users,
  Lock,
  Globe,
  UserPlus,
  UserMinus,
  Settings,
  ExternalLink,
} from '@/components/icons';
import { Group } from '@/hooks/useGroups';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { JoyBurst } from '@/components/messaging/JoyBurst';
import { useGroupJoinBurstTrigger } from '@/components/groups/useGroupJoinBurstTrigger';

const GroupCardFixture = () => (
  <Card>
    <CardHeader>
      <div className="pb-4">
        <div className="flex items-start gap-4">
          <Avatar>
            <AvatarFallback>S</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-semibold">Sample Group</p>
            <div className="flex items-center gap-1">
              <Users size={12} />
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
        <Badge variant="outline" className="border-0">
          <span className="text-xs">Tag 1</span>
        </Badge>
        <Badge variant="outline" className="border-0">
          <span className="text-xs">Tag 2</span>
        </Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm">
          View
        </Button>
        <Button size="sm">Join</Button>
      </div>
    </CardContent>
  </Card>
);

interface GroupCardProps {
  group?: Group;
  loading?: boolean;
  /** When false, the join/request action becomes a sign-in prompt. Default true. */
  isAuthenticated?: boolean;
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
  isAuthenticated = true,
  onJoin,
  onLeave,
  onRequestJoin,
  onManage,
  isJoining,
  isLeaving,
  isRequesting,
}: GroupCardProps) => {
  // Queer-joy burst on a successful join — same monochrome confetti toolkit
  // as /messages' match celebration, extended to Groups (2026-07 hub
  // redesign; see CLAUDE.md's motion-zone exception). Called unconditionally
  // (before the loading/skeleton early return) to satisfy rules-of-hooks.
  const { joy, setJoy } = useGroupJoinBurstTrigger(group?.is_member);

  if (loading || !group) {
    return (
      <Skeleton
        name="group-card"
        loading={true}
        fixture={<GroupCardFixture />}
        fallback={<PageLoadingState count={1} />}
      >
        <div />
      </Skeleton>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <Card className="group relative overflow-hidden">
      {joy && <JoyBurst onDone={() => setJoy(false)} />}
      {/* Same plate as every other card: the group's picture, or the station
          plate with the community mark when it has none. The picture is a second
          route to the group page, so it is out of the tab order. */}
      <LocalizedLink
        to={`/hub/groups/${group.id}`}
        tabIndex={-1}
        aria-hidden="true"
        className="block"
      >
        <Image
          src={group.image_url}
          alt=""
          aspect="card"
          imageRole="cover"
          rounded="none"
          fallbackEntityType="default"
          fallbackKey={group.id}
          fallbackGlyph="community"
        />
      </LocalizedLink>
      <CardHeader
        className={group.image_url ? 'pt-0 group-has-[[data-fallback=station]]:pt-6' : undefined}
      >
        {group.image_url && <StationBadge glyph="community" className="-mt-8 mb-2" />}
        <div className="pb-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.is_private ? (
                  <Lock size={12} aria-hidden="true" />
                ) : (
                  <Globe size={12} aria-hidden="true" />
                )}
                {group.is_private ? 'Private group' : 'Public group'}
                {group.city ? ` · ${group.city}` : ''}
              </p>
              <LocalizedLink to={`/hub/groups/${group.id}`} className="no-underline">
                <h3 className="text-title font-bold leading-tight truncate hover:underline">
                  {group.name}
                </h3>
              </LocalizedLink>

              <div className="mt-1 flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Users size={12} />
                  <p className="text-sm font-medium">{group.member_count}</p>
                  <p className="text-sm text-muted-foreground">members</p>
                </div>
                {group.user_role && (
                  <Badge variant="secondary" className="border-0">
                    <span className="text-xs">{group.user_role}</span>
                  </Badge>
                )}
                {!group.is_member && group.has_pending_request && (
                  <Badge variant="outline" className="border-0">
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
                <Settings size={16} />
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
              <Badge key={tag} variant="outline" className="border-0">
                <span className="text-xs">{tag}</span>
              </Badge>
            ))}
            {group.tags.length > 3 && (
              <Badge variant="outline" className="border-0">
                <span className="text-xs">+{group.tags.length - 3} more</span>
              </Badge>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <LocalizedLink to={`/hub/groups/${group.id}`}>
              <span className="flex items-center">
                <ExternalLink size={16} className="mr-2" />
                View Group
              </span>
            </LocalizedLink>
          </Button>

          {!isAuthenticated ? (
            <Button asChild size="sm">
              <LocalizedLink to="/auth">
                <span className="flex items-center">
                  <UserPlus size={16} className="mr-2" />
                  Sign in to join
                </span>
              </LocalizedLink>
            </Button>
          ) : !group.is_member ? (
            group.is_private ? (
              group.has_pending_request ? (
                <Button disabled variant="soft" size="sm">
                  <Lock size={16} className="mr-2" />
                  Requested
                </Button>
              ) : (
                <Button onClick={() => onRequestJoin?.(group.id)} disabled={isRequesting} size="sm">
                  <UserPlus size={16} className="mr-2" />
                  {isRequesting ? 'Requesting...' : 'Request to Join'}
                </Button>
              )
            ) : (
              <Button onClick={() => onJoin?.(group.id)} disabled={isJoining} size="sm">
                <UserPlus size={16} className="mr-2" />
                {isJoining ? 'Joining...' : 'Join'}
              </Button>
            )
          ) : (
            <Button
              onClick={() => onLeave?.(group.id)}
              disabled={isLeaving}
              variant="soft"
              size="sm"
            >
              <UserMinus size={16} className="mr-2" />
              {isLeaving ? 'Leaving...' : 'Leave'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
