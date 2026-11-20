import type { ReactNode } from 'react';
import { shortLocation } from '@/lib/shortLocation';
import { Button } from '@/components/ui/button';
import { AvatarDisplay } from '@/components/profile/AvatarDisplay';
import type { AvatarConfig } from '@/components/profile/avatarConfig';
import { Camera, Check } from '@/components/icons';
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
  /** Owner looking at their own page through the "You" lens: edit controls. */
  isOwnProfile: boolean;
  /** Owner previewing through Community/Public: no owner controls, no visitor actions. */
  previewing?: boolean;
  status?: UserStatus | null;
  onEditStatus?: () => void;
  onEditAvatar?: () => void;
  /** Icon buttons (settings, share, report) placed beside the primary action. */
  tools?: ReactNode;
}

function formatJoined(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  previewing = false,
  status,
  onEditStatus,
  onEditAvatar,
  tools,
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

  const avatar = (
    <AvatarDisplay
      avatarUrl={profile.avatar_url as string | undefined}
      avatarConfig={profile.avatar_config as AvatarConfig | undefined}
      email={profile.user_id as string}
      size="xl"
    />
  );

  const meta = [
    profile.pronouns as string | undefined,
    profile.age_range as string | undefined,
    profile.location ? shortLocation(profile.location as string) : undefined,
    profile.created_at
      ? t('profile.joined', 'Joined {{date}}', {
          date: formatJoined(profile.created_at as string),
        })
      : undefined,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label={t('profile.headerLabel', 'Profile')}
      className="flex flex-col gap-6 rounded-container bg-card p-6 shadow-soft sm:flex-row sm:items-start md:p-8"
    >
      <div className="relative shrink-0 self-start">
        {isOwnProfile && onEditAvatar ? (
          <button
            type="button"
            onClick={onEditAvatar}
            aria-label={t('profile.editAvatar', 'Change avatar')}
            className="group block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {avatar}
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex size-8 items-center justify-center rounded-full bg-foreground text-background ring-4 ring-card"
            >
              <Camera size={14} />
            </span>
          </button>
        ) : (
          avatar
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="break-words font-display text-headline leading-none md:text-display">
              {displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-13 text-muted-foreground">
              <TrustTierBadge userId={profile.user_id as string} showLabel />
              {!!profile.verified_identity && (
                <span className="inline-flex items-center gap-1 font-bold text-foreground">
                  <Check size={14} aria-hidden="true" />
                  {t('profile.verified', 'Verified')}
                </span>
              )}
              {meta.map((m) => (
                <span key={m} className="before:mr-2 before:content-['·']">
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwnProfile && (
              <Button asChild>
                <LocalizedLink to="/settings/profile">
                  {t('profile.editProfile', 'Edit profile')}
                </LocalizedLink>
              </Button>
            )}
            {!isOwnProfile && !previewing && (
              <>
                <StartConversationButton
                  userId={profile.user_id as string}
                  userName={displayName}
                  variant="default"
                />
                <UserRelationshipActions targetUserId={profile.user_id as string} />
              </>
            )}
            {tools}
          </div>
        </div>

        {!!profile.bio && (
          <p className="max-w-2xl text-body-lg text-foreground">{profile.bio as string}</p>
        )}

        <FlagChipRow flagIds={profile.identity_flags as string[] | undefined} />

        {(hasStatus || isOwnProfile) && (
          <div className="max-w-2xl">
            {hasStatus ? (
              <StatusBar
                status={status ?? undefined}
                onClick={isOwnProfile ? onEditStatus : undefined}
              />
            ) : (
              <button
                type="button"
                onClick={onEditStatus}
                className="rounded-badge text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {t('profile.setStatus', 'Set a status…')}
              </button>
            )}
          </div>
        )}

        {socialAccounts.length > 0 && (
          <SocialAccountsDisplay
            socialAccounts={profile.social_accounts}
            socialLinks={socialLinks}
          />
        )}
      </div>
    </section>
  );
}
