import { useTranslation } from 'react-i18next';
import { AuthGate } from '@/components/layout/AuthGate';
import { HubShell } from '@/components/hub/HubShell';
import { OverviewModule } from '@/components/hub/modules/OverviewModule';
import { MessagesModule } from '@/components/hub/modules/MessagesModule';
import { PlansModule } from '@/components/hub/modules/PlansModule';
import { SavedModule } from '@/components/hub/modules/SavedModule';
import Feed from '@/pages/Feed';
import { useMeta } from '@/hooks/useMeta';
import type { HubModuleId } from '@/config/hubModules';
import { PageContainer } from '@/components/layout/PageContainer';

const MODULE_TITLES: Record<HubModuleId, string> = {
  overview: 'Overview',
  feed: 'Community Feed',
  messages: 'Messages',
  plans: 'Plans',
  saved: 'Saved',
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
    ) : module === 'messages' ? (
      <MessagesModule />
    ) : module === 'plans' ? (
      <PlansModule />
    ) : module === 'saved' ? (
      <SavedModule />
    ) : (
      <OverviewModule />
    );

  const content = isPublicFeed ? (
    body
  ) : (
    <AuthGate
      title={t('hub.title', 'Your hub')}
      description={t('hub.signInDesc', 'Sign in to see your messages, plans and saved places.')}
    >
      {body}
    </AuthGate>
  );

  return (
    <PageContainer>
      <HubShell active={module}>{content}</HubShell>
    </PageContainer>
  );
}
