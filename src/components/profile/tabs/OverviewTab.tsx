import type { ReactNode } from 'react';
import type { ProfileEditorSection } from '@/lib/profileEditing';
import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { SocialSummaryRow } from '@/components/profile/SocialSummaryRow';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { GapPromptCard } from '@/components/profile/GapPromptCard';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { BodyProfileCard } from '@/components/profile/BodyProfileCard';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { Button } from '@/components/ui/button';
import { getProfileGap } from '@/lib/profileGaps';
import { previewFilterProfile, sectionVisible, type ProfileLens } from '@/lib/profileLens';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const ownView = isOwnProfile && lens === 'you';
  const handle = profile.username ? `@${profile.username as string}` : null;
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

  // Photos sit beside the avatar as part of who you are, under the same
  // audience setting that gated them when they lived on the Activity tab.
  const photosVisible = sectionVisible(
    privacy.contributions_visibility as string | undefined,
    isOwnProfile ? lens : 'community',
    'public',
  );

  return (
    <div className="flex flex-col gap-6">
      {ownView && editor}
      {hasGap && <GapPromptCard profile={profile} />}

      {/* Most members never write a bio; say so instead of an empty page.
          The header carries the Say hi button. */}
      {!isOwnProfile && !profile.bio && (
        <p className="text-body-lg text-muted-foreground">
          {t('profile.noBio', '{{name}} hasn’t written a bio yet. Say hi and ask.', {
            name: handle ?? t('profile.thisMember', 'This member'),
          })}
        </p>
      )}

      {photosVisible && (
        <PhotoGallery userId={profile.user_id as string} isOwnProfile={ownView} hideWhenEmpty />
      )}

      {socialVisible && (
        <SocialSummaryRow
          userId={profile.user_id as string}
          isOwnProfile={ownView}
          onPostsClick={onPostsClick}
        />
      )}

      {/* The newest posts, so a profile reads as someone active; the rest
          live on the Posts tab. Absent when there are none. */}
      {photosVisible && (
        <UserPostsList
          userId={profile.user_id as string}
          isOwnProfile={ownView}
          limit={2}
          heading={
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="font-sans text-title font-bold">
                {t('profile.posts.latest', 'Latest posts')}
              </h3>
              {onPostsClick && (
                <Button variant="ghost" size="sm" onClick={onPostsClick}>
                  {t('profile.posts.all', 'All posts')}
                </Button>
              )}
            </div>
          }
        />
      )}

      {/* Absent when empty, for everyone: absence reads as "nothing yet" or
          "not shared", which an empty card only restated. */}
      {activityVisible && <ActivityStrip userId={profile.user_id as string} hideWhenEmpty />}

      <BodyProfileCard
        userId={profile.user_id as string}
        ownerLens={isOwnProfile ? lens : undefined}
      />

      <SecureProfileViewer
        profile={isOwnProfile ? previewFilterProfile(profile, lens) : profile}
        isOwnProfile={ownView}
        onEdit={ownView ? onEdit : undefined}
      />
    </div>
  );
}
