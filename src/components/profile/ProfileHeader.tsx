import { shortLocation } from '@/lib/shortLocation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import type { AvatarConfig } from '@/components/profile/avatarConfig';
import { MapPin, Check } from '@/components/icons';
import { StartConversationButton } from '@/components/messaging/StartConversationButton';
import { TrustTierBadge } from '@/components/profile/TrustTierBadge';
import { UserRelationshipActions } from '@/components/profile/UserRelationshipActions';
import { SocialAccountsDisplay } from '@/components/profile/SocialAccountsDisplay';
import { readAccounts } from '@/lib/socialAccounts';
import { StatusBar } from '@/components/status/StatusBar';
import { FlagChipRow } from '@/components/profile/FlagChip';
import { publicDisplayName } from '@/lib/displayName';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTranslation } from 'react-i18next';
import type { UserStatus } from '@/hooks/useStatus';

interface ProfileHeaderProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
  status?: UserStatus | null;
  onEditStatus?: () => void;
  onEditAvatar?: () => void;
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
  onEditStatus,
  onEditAvatar,
}: ProfileHeaderProps) {
  const { t } = useTranslation();
  const username = profile.username as string | undefined;
  // The @username handle is the single visible identity. display_name mirrors it;
  // publicDisplayName stays as an email-strip guard for any un-mirrored legacy row.
  const displayName = username
    ? `@${username}`
    : publicDisplayName(profile.display_name as string) || 'Anonymous User';
  const socialLinks = profile.social_links as Record<string, unknown> | undefined;
  const socialAccounts = readAccounts(profile.social_accounts, socialLinks);
  const hasStatus =
    !!status &&
    (status.emoji ||
      status.text ||
      status.dndActive ||
      status.travel ||
      (status.tags?.length ?? 0) > 0);

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex flex-col items-center gap-2 text-center md:text-left">
            {isOwnProfile && onEditAvatar ? (
              <button
                type="button"
                onClick={onEditAvatar}
                aria-label={t('profile.editAvatar', 'Change avatar')}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AvatarDisplay
                  avatarUrl={profile.avatar_url as string | undefined}
                  avatarConfig={profile.avatar_config as AvatarConfig | undefined}
                  email={profile.user_id as string}
                  size="lg"
                />
              </button>
            ) : (
              <AvatarDisplay
                avatarUrl={profile.avatar_url as string | undefined}
                avatarConfig={profile.avatar_config as AvatarConfig | undefined}
                email={profile.user_id as string}
                size="lg"
              />
            )}
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
                  <TrustTierBadge userId={profile.user_id as string} showLabel />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-muted-foreground mb-4 text-13 md:justify-start [&>*+*]:before:content-['•'] [&>*+*]:before:mr-2">
                {!!profile.pronouns && <span>{profile.pronouns as string}</span>}
                {!!profile.age_range && <span>{profile.age_range as string}</span>}
                {!!profile.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} aria-hidden />
                    {shortLocation(profile.location as string)}
                  </span>
                )}
                {!!profile.created_at && (
                  <span>
                    {t('profile.joined', 'Joined {{date}}', {
                      date: formatJoined(profile.created_at as string),
                    })}
                  </span>
                )}
              </div>

              <FlagChipRow
                flagIds={profile.identity_flags as string[] | undefined}
                className="mb-4 justify-center md:justify-start"
              />

              {!!profile.bio && (
                <p className="text-muted-foreground mb-4 max-w-2xl">{profile.bio as string}</p>
              )}

              {(hasStatus || isOwnProfile) && (
                <div className="mb-4 max-w-2xl">
                  <StatusBar
                    status={status ?? undefined}
                    onClick={isOwnProfile ? onEditStatus : undefined}
                  />
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
                  <SocialAccountsDisplay
                    socialAccounts={profile.social_accounts}
                    socialLinks={socialLinks}
                  />
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
                <Button asChild>
                  <LocalizedLink to="/settings/profile">
                    {t('profile.editProfile', 'Edit profile')}
                  </LocalizedLink>
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
