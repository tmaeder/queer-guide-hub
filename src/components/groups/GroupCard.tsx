import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { StationBadge } from '@/components/ui/StationBadge';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Users, Lock, UserPlus, UserMinus, Settings } from '@/components/icons';
import { Group } from '@/hooks/useGroups';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { JoyBurst } from '@/components/messaging/JoyBurst';
import { useGroupJoinBurstTrigger } from '@/components/groups/useGroupJoinBurstTrigger';

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
  const { t } = useTranslation();
  const { pathname, search } = useLocation();

  if (loading || !group) {
    return (
      <div>
        <PageLoadingState count={1} />
      </div>
    );
  }

  const canManage = group.user_role === 'admin' || group.user_role === 'moderator';

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden">
      {joy && <JoyBurst onDone={() => setJoy(false)} />}
      {/* Photos add context; groups without one lead with their name and purpose. */}
      {group.image_url && (
        <LocalizedLink
          to={`/meet/groups/${group.id}`}
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
      )}
      <CardHeader
        className={
          group.image_url ? 'pt-0 group-has-[[data-fallback=station]]/card:pt-6' : undefined
        }
      >
        {group.image_url && <StationBadge glyph="community" className="-mt-8 mb-2" />}
        <div>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {/* Public is the default, so only a private group or a city earns the eyebrow. */}
              {(group.is_private || group.city) && (
                <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.is_private && <Lock size={12} aria-hidden="true" />}
                  {[group.is_private ? t('groupCard.private', 'Private group') : null, group.city]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <LocalizedLink to={`/meet/groups/${group.id}`} className="no-underline">
                <h3 className="text-title font-bold leading-tight line-clamp-2 break-words hover:underline">
                  {group.name}
                </h3>
              </LocalizedLink>

              <div className="mt-1 flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Users size={12} aria-hidden />
                  <p className="text-sm font-medium">{group.member_count}</p>
                  <p className="text-sm text-muted-foreground">
                    {group.member_count === 1
                      ? t('groupCard.member', 'member')
                      : t('groupCard.members', 'members')}
                  </p>
                </div>
                {group.user_role && (
                  <Badge variant="secondary" className="border-0">
                    <span className="text-xs">{group.user_role}</span>
                  </Badge>
                )}
                {!group.is_member && group.has_pending_request && (
                  <Badge variant="outline" className="border-0">
                    <span className="text-xs">{t('groupCard.pending', 'Pending')}</span>
                  </Badge>
                )}
              </div>
            </div>

            {canManage && onManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onManage(group)}
                aria-label={t('groupCard.manage', 'Manage group settings')}
              >
                <Settings size={16} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
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
                <span className="text-xs">
                  +{group.tags.length - 3} {t('groupCard.more', 'more')}
                </span>
              </Badge>
            )}
          </div>
        )}

        {/* One labelled action, pinned to the card bottom so a row of cards lines up.
            The title is the link to the group; a second arrow button duplicated it. */}
        <div className="mt-auto flex gap-2">
          {!isAuthenticated ? (
            <Button asChild size="sm" variant="outline" className="gap-2">
              <LocalizedLink
                to={`/auth?redirect=${encodeURIComponent(pathname + search)}`}
                className="no-underline"
              >
                <UserPlus size={16} aria-hidden />
                {t('groupCard.signInToJoin', 'Sign in to join')}
              </LocalizedLink>
            </Button>
          ) : !group.is_member ? (
            group.is_private ? (
              group.has_pending_request ? (
                <Button disabled variant="soft" size="sm" className="gap-2">
                  <Lock size={16} aria-hidden />
                  {t('groupCard.requested', 'Requested')}
                </Button>
              ) : (
                <Button
                  onClick={() => onRequestJoin?.(group.id)}
                  disabled={isRequesting}
                  size="sm"
                  className="gap-2"
                >
                  <UserPlus size={16} aria-hidden />
                  {isRequesting
                    ? t('groupCard.requesting', 'Requesting…')
                    : t('groupCard.requestToJoin', 'Request to join')}
                </Button>
              )
            ) : (
              <Button
                onClick={() => onJoin?.(group.id)}
                disabled={isJoining}
                size="sm"
                className="gap-2"
              >
                <UserPlus size={16} aria-hidden />
                {isJoining ? t('groupCard.joining', 'Joining…') : t('groupCard.join', 'Join')}
              </Button>
            )
          ) : (
            <Button
              onClick={() => onLeave?.(group.id)}
              disabled={isLeaving}
              variant="soft"
              size="sm"
              className="gap-2"
            >
              <UserMinus size={16} aria-hidden />
              {isLeaving ? t('groupCard.leaving', 'Leaving…') : t('groupCard.leave', 'Leave')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
