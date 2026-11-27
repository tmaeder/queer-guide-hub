import { useTranslation } from 'react-i18next';
import { GroupsTab } from '@/components/profile/tabs/GroupsTab';
import { ContributionsTab } from '@/components/profile/tabs/ContributionsTab';
import type { ProfileLens } from '@/lib/profileLens';

interface ActivityTabProps {
  userId: string;
  isOwnProfile: boolean;
  lens?: ProfileLens;
  privacySettings?: Record<string, unknown>;
}

/** Groups and contributions on one tab — what this person does in the community. */
export function ActivityTab(props: ActivityTabProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="activity-groups" className="flex flex-col gap-4">
        <h3 id="activity-groups" className="font-sans text-title font-bold">
          {t('profile.tabs.groups', 'Groups')}
        </h3>
        <GroupsTab {...props} />
      </section>
      <ContributionsTab {...props} />
    </div>
  );
}
