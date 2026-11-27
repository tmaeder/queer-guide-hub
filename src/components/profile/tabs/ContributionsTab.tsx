import { useTranslation } from 'react-i18next';
import { profileEditPath } from '@/lib/profileEditing';
import { UserReviewsList } from '@/components/profile/contributions/UserReviewsList';
import { UserSubmissionsList } from '@/components/profile/contributions/UserSubmissionsList';
import { WatchedSitesList } from '@/components/profile/contributions/WatchedSitesList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { sectionVisible, type ProfileLens } from '@/lib/profileLens';

interface ContributionsTabProps {
  userId: string;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  privacySettings?: Record<string, unknown>;
}

/** What this user gave to the community: reviews and submissions. Posts have their own tab. */
export function ContributionsTab({
  userId,
  isOwnProfile,
  lens = 'you',
  privacySettings = {},
}: ContributionsTabProps) {
  const { t } = useTranslation();
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
          <LocalizedLink to={profileEditPath(userId, 'privacy')} className="underline">
            Privacy settings
          </LocalizedLink>
        )}
      </p>
    );
  }
  const reviews = {
    id: 'contribution-reviews',
    title: t('profile.contributions.reviews', 'Reviews'),
  };
  const submissions = {
    id: 'contribution-submissions',
    title: t('profile.contributions.submissions', 'Submissions'),
  };
  const watches = {
    id: 'contribution-watches',
    title: t('profile.contributions.watches', 'Watched sites'),
  };

  return (
    <div className="flex flex-col gap-8">
      <section id={reviews.id} aria-label={reviews.title} className="flex flex-col gap-4">
        <h3 className="font-sans text-title font-bold">{reviews.title}</h3>
        <UserReviewsList userId={userId} />
      </section>
      {ownView && (
        <section id={submissions.id} aria-label={submissions.title} className="flex flex-col gap-4">
          <h3 className="font-sans text-title font-bold">{submissions.title}</h3>
          <p className="text-13 text-muted-foreground -mt-2">Visible only to you.</p>
          <UserSubmissionsList />
        </section>
      )}
      {ownView && (
        <section id={watches.id} aria-label={watches.title} className="flex flex-col gap-4">
          <h3 className="font-sans text-title font-bold">{watches.title}</h3>
          <p className="text-13 text-muted-foreground -mt-2">
            Sites we re-check for new content to import. Visible only to you.
          </p>
          <WatchedSitesList />
        </section>
      )}
    </div>
  );
}
