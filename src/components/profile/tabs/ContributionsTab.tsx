import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { UserReviewsList } from '@/components/profile/contributions/UserReviewsList';
import { UserSubmissionsList } from '@/components/profile/contributions/UserSubmissionsList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { sectionVisible, type ProfileLens } from '@/lib/profileLens';

interface ContributionsTabProps {
  userId: string;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  privacySettings?: Record<string, unknown>;
}

/** What this user gave to the community: posts, reviews, photos, submissions. */
export function ContributionsTab({ userId, isOwnProfile, lens = 'you', privacySettings = {} }: ContributionsTabProps) {
  const ownView = isOwnProfile && lens === 'you';
  const visible = sectionVisible(
    privacySettings.contributions_visibility as string | undefined,
    isOwnProfile ? lens : 'community',
    'public',
  );
  if (!visible) {
    return (
      <p className="py-8 text-center text-13 text-muted-foreground">
        Contributions hidden at this visibility.{' '}
        {isOwnProfile && (
          <LocalizedLink to="/settings?section=privacy" className="underline">
            Privacy settings
          </LocalizedLink>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Posts" className="flex flex-col gap-4">
        <h2 className="text-title font-semibold">Posts</h2>
        <UserPostsList userId={userId} isOwnProfile={ownView} />
      </section>
      <section aria-label="Reviews" className="flex flex-col gap-4">
        <h2 className="text-title font-semibold">Reviews</h2>
        <UserReviewsList userId={userId} />
      </section>
      <section aria-label="Photos" className="flex flex-col gap-4">
        <h2 className="text-title font-semibold">Photos</h2>
        <PhotoGallery userId={userId} isOwnProfile={ownView} />
      </section>
      {ownView && (
        <section aria-label="Submissions" className="flex flex-col gap-4">
          <h2 className="text-title font-semibold">Submissions</h2>
          <p className="text-13 text-muted-foreground -mt-2">Visible only to you.</p>
          <UserSubmissionsList />
        </section>
      )}
    </div>
  );
}
