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
  overview: 'Overview',
  feed: 'Community Feed',
  friends: 'Friends',
  plans: 'Plans',
  saved: 'Saved',
  progress: 'Progress',
};

/**
 * /hub — one shell for the public community feed and the signed-in personal
 * office. Public identity stays at /user/:userId.
 *
 * Feed is intentionally public. The other modules keep their own auth gate so
 * the shell and its wayfinding do not disappear for signed-out feed readers.
 */
export default function HubPage({ module = 'overview' }: { module?: HubModuleId }) {
  const { t } = useTranslation();
  const isPublicFeed = module === 'feed';
  useMeta({
    title: isPublicFeed
      ? 'Community Feed — What Queer People Are Posting'
      : `${MODULE_TITLES[module]} · Hub`,
    description: isPublicFeed
      ? 'Recommendations, questions, meet-ups and news shared by Queer Guide members worldwide.'
      : undefined,
    canonicalPath: isPublicFeed ? '/hub/feed' : undefined,
    noIndex: !isPublicFeed,
  });

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

  const content = isPublicFeed ? (
    body
  ) : (
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
