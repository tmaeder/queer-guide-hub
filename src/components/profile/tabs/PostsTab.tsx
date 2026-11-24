import { useTranslation } from 'react-i18next';
import { UserPostsList } from '@/components/posts/UserPostsList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { profileEditPath } from '@/lib/profileEditing';
import { sectionVisible, type ProfileLens } from '@/lib/profileLens';

interface PostsTabProps {
  userId: string;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  privacySettings?: Record<string, unknown>;
}

/**
 * This person's posts, newest first. The owner writes from here too; everyone
 * else's posts stay in the community feed at /hub/feed. Gated by the same
 * contributions setting that covered posts on the Activity tab.
 */
export function PostsTab({
  userId,
  isOwnProfile,
  lens = 'you',
  privacySettings = {},
}: PostsTabProps) {
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
        {t('profile.posts.hidden', 'Posts hidden at this visibility.')}{' '}
        {isOwnProfile && (
          <LocalizedLink to={profileEditPath(userId, 'privacy')} className="underline">
            {t('profile.posts.privacy', 'Privacy settings')}
          </LocalizedLink>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <UserPostsList userId={userId} isOwnProfile={ownView} />
      <Button variant="outline" asChild className="self-start">
        <LocalizedLink to="/hub/feed">
          {t('profile.posts.openFeed', 'Open community feed')}
        </LocalizedLink>
      </Button>
    </div>
  );
}
