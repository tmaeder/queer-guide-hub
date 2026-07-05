import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { HubShell } from '@/components/hub/HubShell';
import { InboxModule } from '@/components/hub/modules/InboxModule';
import { SavedModule } from '@/components/hub/modules/SavedModule';
import { TripsModule } from '@/components/hub/modules/TripsModule';
import { CalendarModule } from '@/components/hub/modules/CalendarModule';
import { ContactsModule } from '@/components/hub/modules/ContactsModule';
import { NewsModule } from '@/components/hub/modules/NewsModule';
import { useMeta } from '@/hooks/useMeta';
import type { HubModuleId } from '@/config/hubModules';

const MODULE_TITLES: Record<HubModuleId, string> = {
  inbox: 'Inbox',
  calendar: 'Calendar',
  contacts: 'Contacts',
  saved: 'Saved',
  news: 'News',
  trips: 'Trips',
};

/**
 * /hub — the personal office space. Replaces /messages and the private /me
 * hub: one shell, module per concern (registry in src/config/hubModules.ts).
 * Public identity stays at /user/:userId.
 */
export default function HubPage({ module = 'inbox' }: { module?: HubModuleId }) {
  const { t } = useTranslation();
  useMeta({ title: `${MODULE_TITLES[module]} · Hub`, noIndex: true });

  const body =
    module === 'saved' ? (
      <SavedModule />
    ) : module === 'trips' ? (
      <TripsModule />
    ) : module === 'calendar' ? (
      <CalendarModule />
    ) : module === 'contacts' ? (
      <ContactsModule />
    ) : module === 'news' ? (
      <NewsModule />
    ) : (
      <InboxModule />
    );

  return (
    <AuthGate
      title={t('hub.title', 'Your hub')}
      description={t('hub.signInDesc', 'Sign in to see your inbox, trips and saved places.')}
    >
      <div className="container mx-auto px-4 py-6 pb-24 md:py-8">
        <HubShell active={module}>{body}</HubShell>
      </div>
    </AuthGate>
  );
}
