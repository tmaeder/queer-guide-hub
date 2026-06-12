import { PhotoGallery } from '@/components/profile/PhotoGallery';
import { UserPostsList } from '@/components/posts/UserPostsList';

interface ContributionsTabProps {
  userId: string;
  isOwnProfile: boolean;
}

/**
 * What this user gave to the community. Photos + posts now; reviews and
 * submissions sections land with the contributions aggregation hooks.
 */
export function ContributionsTab({ userId, isOwnProfile }: ContributionsTabProps) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Posts" className="flex flex-col gap-4">
        <h2 className="text-title font-semibold">Posts</h2>
        <UserPostsList userId={userId} isOwnProfile={isOwnProfile} />
      </section>
      <section aria-label="Photos" className="flex flex-col gap-4">
        <h2 className="text-title font-semibold">Photos</h2>
        <PhotoGallery userId={userId} isOwnProfile={isOwnProfile} />
      </section>
    </div>
  );
}
