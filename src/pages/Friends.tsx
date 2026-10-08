import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { FriendsPanel } from '@/components/community/FriendsPanel';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * /people/friends — own-only page around the shared FriendsPanel (also
 * embedded in the /hub Contacts module).
 */
export default function Friends() {
  const { t } = useTranslation();
  return (
    <AuthGate
      title={t('pages.friends.title', 'Friends')}
      description={t('pages.friends.gate', 'Please sign in to view your friends.')}
    >
      <PageContainer>
        <div className="flex flex-col gap-6">
          <PageHeader
            title={t('pages.friends.title', 'Friends')}
            subtitle={t(
              'pages.friends.subtitle',
              'Review requests, keep up with your connections, and start a conversation.',
            )}
          />
          <FriendsPanel />
        </div>
      </PageContainer>
    </AuthGate>
  );
}
