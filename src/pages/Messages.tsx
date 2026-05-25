import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MessagingInterface } from '@/components/messaging/MessagingInterface';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Inbox tab → conversation_type values it should surface.
// 'all' (empty array) means no filter — surface every conversation.
const TAB_FILTERS: Record<string, readonly string[]> = {
  all: [],
  direct: ['direct'],
  groups: ['group'],
  matches: ['match'],
  trips: ['trip'],
  system: ['system'],
};

const VALID_TABS = Object.keys(TAB_FILTERS);

export default function Messages() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'all';
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'all';
  const typeFilter = useMemo(() => TAB_FILTERS[activeTab], [activeTab]);

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

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

        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="h-auto gap-0 rounded-none border-0 border-b border-border bg-transparent p-0 backdrop-blur-none w-full justify-start overflow-x-auto">
            {(
              [
                ['all', 'All'],
                ['direct', 'Direct'],
                ['groups', 'Groups'],
                ['matches', 'Matches'],
                ['trips', 'Trips'],
                ['system', 'System'],
              ] as const
            ).map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:border-foreground data-[state=active]:shadow-none"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <MessagingInterface typeFilter={typeFilter} />
      </div>
    </AuthGate>
  );
}
