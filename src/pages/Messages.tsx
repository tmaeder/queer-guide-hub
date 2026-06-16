import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { InboxFilterChips } from '@/components/messaging/InboxFilterChips';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import type { InboxFilter } from '@/hooks/useInboxFeed';

export default function Messages() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<InboxFilter>('all');

  return (
    <AuthGate
      title={t('pages.messages.title', 'Messages')}
      description={t('pages.messages.signInDesc', 'Please sign in to access your messages.')}
    >
      <div className="container mx-auto py-8 px-4">
        <PageHeader
          title="Messages"
          subtitle={t('pages.messages.subtitle', 'Stay connected with your community')}
        />

        <div className="flex h-full flex-col">
          <InboxFilterChips value={filter} onChange={setFilter} />
          <MessagingInterface filter={filter} />
        </div>
      </div>
    </AuthGate>
  );
}
