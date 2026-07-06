import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { HubShell } from '@/components/hub/HubShell';
import { OverviewModule } from '@/components/hub/modules/OverviewModule';
import { MessagesModule } from '@/components/hub/modules/MessagesModule';
import { PlansModule } from '@/components/hub/modules/PlansModule';
import { SavedModule } from '@/components/hub/modules/SavedModule';
import { useMeta } from '@/hooks/useMeta';
import type { HubModuleId } from '@/config/hubModules';

const MODULE_TITLES: Record<HubModuleId, string> = {
  overview: 'Overview',
  messages: 'Messages',
  plans: 'Plans',
  saved: 'Saved',
};

/**
 * /hub — the personal office space. Replaces /messages and the private /me
 * hub: one shell, module per concern (registry in src/config/hubModules.ts).
 * Public identity stays at /user/:userId.
 *
 * Consolidated 2026-07 to four surfaces: Overview (landing), Messages
 * (inbox + people), Plans (calendar agenda + trips) and Saved.
 */
export default function HubPage({ module = 'overview' }: { module?: HubModuleId }) {
  const { t } = useTranslation();
  useMeta({ title: `${MODULE_TITLES[module]} · Hub`, noIndex: true });

  const body =
    module === 'messages' ? (
      <MessagesModule />
    ) : module === 'plans' ? (
      <PlansModule />
    ) : module === 'saved' ? (
      <SavedModule />
    ) : (
      <OverviewModule />
    );

  return (
    <AuthGate
      title={t('hub.title', 'Your hub')}
      description={t('hub.signInDesc', 'Sign in to see your messages, plans and saved places.')}
    >
      <div className="container mx-auto px-4 py-6 pb-24 md:py-8">
        <HubShell active={module}>{body}</HubShell>
      </div>
    </AuthGate>
  );
}
