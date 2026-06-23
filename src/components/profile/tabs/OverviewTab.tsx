import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { SocialSummaryRow } from '@/components/profile/SocialSummaryRow';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { CompletionNudge } from '@/components/profile/CompletionNudge';
import { GapPromptCard } from '@/components/profile/GapPromptCard';
import { getProfileGap } from '@/lib/profileGaps';
import { previewFilterProfile, sectionVisible, type ProfileLens } from '@/lib/profileLens';

interface OverviewTabProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  completionPct?: number;
  onPostsClick?: () => void;
}

export function OverviewTab({
  profile,
  isOwnProfile,
  lens = 'you',
  completionPct,
  onPostsClick,
}: OverviewTabProps) {
  const ownView = isOwnProfile && lens === 'you';
  // One completion surface only: the actionable gap prompt when there's a
  // specific gap, otherwise the generic percentage nudge.
  const hasGap = ownView && getProfileGap(profile) !== null;
  const privacy = (profile.privacy_settings ?? {}) as Record<string, unknown>;
  const socialVisible = sectionVisible(
    privacy.social_visibility as string | undefined,
    isOwnProfile ? lens : 'community',
    'community',
  );

  return (
    <div className="flex flex-col gap-6">
      {hasGap ? (
        <GapPromptCard profile={profile} />
      ) : (
        ownView &&
        typeof completionPct === 'number' && <CompletionNudge percent={completionPct} />
      )}

      {socialVisible ? (
        <SocialSummaryRow
          userId={profile.user_id as string}
          isOwnProfile={ownView}
          onPostsClick={onPostsClick}
        />
      ) : (
        isOwnProfile && (
          <p className="text-13 text-muted-foreground">
            Community summary hidden at this visibility.{' '}
            <LocalizedLink to="/settings?section=privacy" className="underline">
              Privacy settings
            </LocalizedLink>
          </p>
        )
      )}

      {/* Own activity always (incl. empty state); another user's only when they've
          opted in — RLS returns rows only then, and hideWhenEmpty suppresses the
          card otherwise so absence reads as "not shared", not "no activity". */}
      <ActivityStrip userId={profile.user_id as string} hideWhenEmpty={!ownView} />

      <SecureProfileViewer
        profile={isOwnProfile ? previewFilterProfile(profile, lens) : profile}
        isOwnProfile={ownView}
      />
    </div>
  );
}
