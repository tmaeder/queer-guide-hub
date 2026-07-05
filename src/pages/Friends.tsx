import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { FriendsPanel } from '@/components/community/FriendsPanel';

/**
 * /community/friends — own-only page around the shared FriendsPanel (also
 * embedded in the /hub Contacts module).
 */
export default function Friends() {
  const { t } = useTranslation();
  return (
    <AuthGate
      title={t('pages.friends.title', 'Friends')}
      description={t('pages.friends.gate', 'Please sign in to view your friends.')}
    >
      <div className="container mx-auto py-6 px-4">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-headline-lg font-bold text-foreground">
              {t('pages.friends.title', 'Friends')}
            </h1>
            <p className="text-muted-foreground">
              {t('pages.friends.subtitle', 'Manage your connections')}
            </p>
          </div>
          <FriendsPanel />
        </div>
      </div>
    </AuthGate>
  );
}
