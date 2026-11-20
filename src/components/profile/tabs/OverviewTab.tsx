import type { ReactNode } from 'react';
import type { ProfileEditorSection } from '@/lib/profileEditing';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { SocialSummaryRow } from '@/components/profile/SocialSummaryRow';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { GapPromptCard } from '@/components/profile/GapPromptCard';
import { getProfileGap } from '@/lib/profileGaps';
import { previewFilterProfile, sectionVisible, type ProfileLens } from '@/lib/profileLens';

interface OverviewTabProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  onPostsClick?: () => void;
  onEdit?: (section: ProfileEditorSection, privacyField?: string) => void;
  /** The inline avatar editor, when open. */
  editor?: ReactNode;
}

export function OverviewTab({
  profile,
  isOwnProfile,
  lens = 'you',
  onPostsClick,
  onEdit,
  editor,
}: OverviewTabProps) {
  const ownView = isOwnProfile && lens === 'you';
  // One nudge at most, and only when it names a specific gap.
  const hasGap = ownView && !editor && getProfileGap(profile) !== null;
  const privacy = (profile.privacy_settings ?? {}) as Record<string, unknown>;
  const socialVisible = sectionVisible(
    privacy.social_visibility as string | undefined,
    isOwnProfile ? lens : 'community',
    'community',
  );

  // Other profiles rely on the activity RPC's server gate. The owner's
  // audience preview must not use the owner's privileged activity response.
  const activityVisible =
    !isOwnProfile ||
    sectionVisible(privacy.activity_visibility as string | undefined, lens, 'private');

  return (
    <div className="flex flex-col gap-6">
      {ownView && editor}
      {hasGap && <GapPromptCard profile={profile} />}

      {socialVisible && (
        <SocialSummaryRow
          userId={profile.user_id as string}
          isOwnProfile={ownView}
          onPostsClick={onPostsClick}
        />
      )}

      {/* Absent when empty, for everyone: absence reads as "nothing yet" or
          "not shared", which an empty card only restated. */}
      {activityVisible && <ActivityStrip userId={profile.user_id as string} hideWhenEmpty />}

      <SecureProfileViewer
        profile={isOwnProfile ? previewFilterProfile(profile, lens) : profile}
        isOwnProfile={ownView}
        onEdit={ownView ? onEdit : undefined}
      />
    </div>
  );
}
