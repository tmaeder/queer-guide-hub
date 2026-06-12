import { SecureProfileViewer } from '@/components/profile/SecureProfileViewer';
import { SocialSummaryRow } from '@/components/profile/SocialSummaryRow';
import { ActivityStrip } from '@/components/profile/ActivityStrip';
import { CompletionNudge } from '@/components/profile/CompletionNudge';

interface OverviewTabProps {
  profile: Record<string, unknown>;
  isOwnProfile: boolean;
  completionPct?: number;
  onPostsClick?: () => void;
}

export function OverviewTab({ profile, isOwnProfile, completionPct, onPostsClick }: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {isOwnProfile && typeof completionPct === 'number' && (
        <CompletionNudge percent={completionPct} />
      )}
      <SocialSummaryRow
        userId={profile.user_id as string}
        isOwnProfile={isOwnProfile}
        onPostsClick={onPostsClick}
      />
      {isOwnProfile && <ActivityStrip />}
      <SecureProfileViewer profile={profile} isOwnProfile={isOwnProfile} />
    </div>
  );
}
