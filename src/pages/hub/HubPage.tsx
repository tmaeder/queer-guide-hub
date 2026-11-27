import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { HubShell } from '@/components/hub/HubShell';
import { OverviewModule } from '@/components/hub/modules/OverviewModule';
import { PlansModule } from '@/components/hub/modules/PlansModule';
import { SavedModule } from '@/components/hub/modules/SavedModule';
import { ProgressTab } from '@/components/profile/tabs/ProgressTab';
import Feed from '@/pages/Feed';
import { useMeta } from '@/hooks/useMeta';
import type { HubModuleId } from '@/config/hubModules';

const MODULE_TITLES: Record<HubModuleId, string> = {
  overview: 'Today',
  plans: 'Plans',
  saved: 'Saved',
  friends: 'Friends',
  feed: 'Feed',
  progress: 'Progress',
};

/**
 * /hub — the signed-in member's own things. Public identity stays at
 * /user/:userId; public discovery lives in Meet. Every module, Feed included,
 * sits behind the same sign-in gate and is noindex.
 */
export default function HubPage({ module = 'overview' }: { module?: HubModuleId }) {
  const { t } = useTranslation();
  useMeta({ title: `${MODULE_TITLES[module]} · Hub`, noIndex: true });

  const body =
    module === 'feed' ? (
      <Feed embedded />
    ) : module === 'plans' ? (
      <PlansModule />
    ) : module === 'saved' ? (
      <SavedModule />
    ) : module === 'progress' ? (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('hub.modules.progress', 'Progress')}
          </h1>
          <p className="text-13 text-muted-foreground">
            {t(
              'hub.progress.description',
              'Missions, level, streaks and recognition. Visible only to you.',
            )}
          </p>
        </header>
        <ProgressTab />
      </div>
    ) : (
      <OverviewModule />
    );

  const content = (
    <AuthGate
      title={t('hub.title', 'Your hub')}
      description={t('hub.signInDesc', 'Sign in to see your plans and saved places.')}
    >
      {body}
    </AuthGate>
  );

  // No PageContainer here: HubShell puts the nav in its own container above the
  // workspace's own, so wrapping it again nests two containers and doubles the
  // gutter.
  return <HubShell active={module}>{content}</HubShell>;
}
