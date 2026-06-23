import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MapPin, Calendar, Check } from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { UserModeBadge } from '@/components/profile/UserModeBadge';
import { TrustTierBadge } from '@/components/profile/TrustTierBadge';
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { SocialAccountsDisplay } from '@/components/profile/SocialAccountsDisplay';
import { readAccounts } from '@/lib/socialAccounts';
import { StatusBar } from '@/components/status/StatusBar';
import { ScoreLevelChip } from '@/components/score/ScoreLevelChip';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { publicDisplayName } from '@/lib/displayName';
import type { UserStatus } from '@/hooks/useStatus';

interface ProfileHeaderProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
  status?: UserStatus | null;
  score?: { level: number; tier: string; total_points: number } | null;
  onEditStatus?: () => void;
}

function formatJoined(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  status,
  score,
  onEditStatus,
}: ProfileHeaderProps) {
  const navigate = useLocalizedNavigate();
  // Never expose an email as the name — older rows had display_name = email.
  const displayName = publicDisplayName(profile.display_name as string) || 'Anonymous User';
  const username = profile.username as string | undefined;
  const socialLinks = profile.social_links as Record<string, unknown> | undefined;
  const socialAccounts = readAccounts(profile.social_accounts, socialLinks);
  const hasStatus =
    !!status &&
    (status.emoji || status.text || status.dndActive || status.travel || (status.tags?.length ?? 0) > 0);

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex flex-col items-center text-center md:text-left">
            <Avatar className="size-24 md:size-32 mb-4">
              <AvatarImage
                src={(profile.avatar_url as string) || undefined}
                alt={displayName}
              />
              <AvatarFallback className="text-2xl">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!!profile.verified_identity && (
              <Badge variant="secondary">
                <Check size={12} className="mr-1" />
                Verified
              </Badge>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div>
              <div className="flex flex-col gap-2 mb-2">
                <h1 className="text-headline font-display font-semibold leading-tight">
                  {displayName}
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  {!!profile.user_mode && (
                    <UserModeBadge mode={profile.user_mode} size="lg" />
                  )}
                  <TrustTierBadge userId={profile.user_id as string} showLabel />
                  {score && (
                    <ScoreLevelChip
                      compact
                      level={score.level}
                      tier={score.tier}
                      totalPoints={score.total_points}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-muted-foreground mb-4 text-13 md:justify-start">
                {username && <span>@{username}</span>}
                {!!profile.pronouns && (
                  <>
                    {username && <span aria-hidden>&#8226;</span>}
                    <span>{profile.pronouns as string}</span>
                  </>
                )}
                {!!profile.age_range && (
                  <>
                    <span aria-hidden>&#8226;</span>
                    <span>{profile.age_range as string}</span>
                  </>
                )}
                {!!profile.location && (
                  <>
                    <span aria-hidden>&#8226;</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={14} aria-hidden />
                      {profile.location as string}
                    </span>
                  </>
                )}
              </div>

              {!!profile.bio && (
                <p className="text-muted-foreground mb-4 max-w-2xl">{profile.bio as string}</p>
              )}

              {(hasStatus || isOwnProfile) && (
                <div className="mb-4 max-w-2xl">
                  <StatusBar status={status ?? undefined} onClick={isOwnProfile ? onEditStatus : undefined} />
                  {isOwnProfile && !hasStatus && (
                    <button
                      type="button"
                      onClick={onEditStatus}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Set a status…
                    </button>
                  )}
                </div>
              )}

              {socialAccounts.length > 0 && (
                <div className="mb-4">
                  <SocialAccountsDisplay socialAccounts={profile.social_accounts} socialLinks={socialLinks} />
                </div>
              )}

              {!!profile.created_at && (
                <div className="flex items-center gap-2">
                  <Calendar size={16} aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Joined {formatJoined(profile.created_at as string)}
                  </p>
                </div>
              )}
            </div>

            {!isOwnProfile ? (
              <div className="flex flex-wrap gap-2 [&>*]:w-full sm:[&>*]:w-auto">
                <StartConversationButton
                  userId={profile.user_id as string}
                  userName={displayName}
                  variant="default"
                />
                <UserRelationshipActions targetUserId={profile.user_id as string} />
              </div>
            ) : (
              <div>
                <Button onClick={() => navigate('/settings')} className="rounded-element">
                  Edit profile
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
