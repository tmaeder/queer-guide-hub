import { useTranslation } from 'react-i18next';
import { profileEditPath } from '@/lib/profileEditing';
import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';
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

/** What this user gave to the community: posts, reviews, photos, submissions. */
export function ContributionsTab({ userId, isOwnProfile, lens = 'you', privacySettings = {} }: ContributionsTabProps) {
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
  const posts = { id: 'contribution-posts', title: t('profile.contributions.posts', 'Posts') };
  const reviews = { id: 'contribution-reviews', title: t('profile.contributions.reviews', 'Reviews') };
  const photos = { id: 'contribution-photos', title: t('profile.contributions.photos', 'Photos') };
  const submissions = { id: 'contribution-submissions', title: t('profile.contributions.submissions', 'Submissions') };
  const watches = { id: 'contribution-watches', title: t('profile.contributions.watches', 'Watched sites') };
  const sections = ownView ? [posts, reviews, photos, submissions, watches] : [posts, reviews, photos];

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label={t('profile.contributions.jumpTo', 'On this page')} className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border-hairline pb-4">
        {sections.map(({ id, title }) => (
          <a key={id} href={`#${id}`} className="py-2 text-13 font-medium underline underline-offset-4">
            {title}
          </a>
        ))}
      </nav>
      <section id={posts.id} aria-label={posts.title} className="flex flex-col gap-4">
        <h3 className="font-sans text-title font-bold">{posts.title}</h3>
        <UserPostsList userId={userId} isOwnProfile={ownView} />
      </section>
      <section id={reviews.id} aria-label={reviews.title} className="flex flex-col gap-4">
        <h3 className="font-sans text-title font-bold">{reviews.title}</h3>
        <UserReviewsList userId={userId} />
      </section>
      <section id={photos.id} aria-label={photos.title} className="flex flex-col gap-4">
        <h3 className="font-sans text-title font-bold">{photos.title}</h3>
        <PhotoGallery userId={userId} isOwnProfile={ownView} />
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
