import { useId, useState, type ComponentType } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getActiveHubModule, HUB_MODULES, type HubModuleId } from '@/config/hubModules';
import { MessagesPeek } from '@/components/notifications/MessagesPeek';
import { SafetyNotices, SignalPanel } from '@/components/notifications/SignalPanel';
import { useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { cn } from '@/lib/utils';
import { FeedPeek, FriendsPeek, PlansPeek, ProgressPeek, SavedPeek, TodayPeek } from './HubPeeks';

type TabId = 'messages' | 'alerts' | HubModuleId;

const SECTION_PEEK: Record<
  HubModuleId,
  ComponentType<{ onNavigate: () => void; openLabel: string }>
> = {
  overview: TodayPeek,
  plans: PlansPeek,
  saved: SavedPeek,
  friends: FriendsPeek,
  feed: FeedPeek,
  progress: ProgressPeek,
};

/**
 * The Hub menu's tabs: Messages, Alerts, then every Hub section, each showing
 * its own latest items and a link to the full page. A safety notice pins above
 * them. Opens on whichever inbox lane has something new, else on the section
 * you are in, else Today. Only the selected tab mounts, so one section fetches
 * at a time.
 */
export function HubPanel({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const counts = useInboxUnreadCounts();
  const tripCount = useInboxBadge();
  const alertCount = counts.alerts;
  const messageCount = Math.max(counts.all - counts.alerts, 0);
  const [tab, setTab] = useState<TabId>(() =>
    messageCount > 0
      ? 'messages'
      : alertCount > 0
        ? 'alerts'
        : (getActiveHubModule(pathname)?.id ?? 'overview'),
  );
  const idBase = useId();

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'messages', label: t('inbox.tabs.messages', 'Messages'), count: messageCount },
    { id: 'alerts', label: t('inbox.tabs.alerts', 'Alerts'), count: alertCount },
    ...HUB_MODULES.map((m) => ({
      id: m.id as TabId,
      label: t(m.labelKey, m.defaultLabel),
      count: m.id === 'plans' ? tripCount : 0,
    })),
  ];
  const label = (id: TabId) => tabs.find((x) => x.id === id)?.label ?? '';

  let panel;
  if (tab === 'messages') panel = <MessagesPeek onNavigate={onNavigate} />;
  else if (tab === 'alerts') panel = <SignalPanel embedded />;
  else {
    const Peek = SECTION_PEEK[tab];
    panel = <Peek onNavigate={onNavigate} openLabel={label(tab)} />;
  }

  return (
    <>
      <div className="pt-4">
        <SafetyNotices />
      </div>
      {/* One row, scrolls sideways when the tabs don't fit (8 tabs at 375px). */}
      <div
        role="tablist"
        aria-label={t('header.mobileNav.hub', 'Hub')}
        className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-1"
      >
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${idBase}-panel-${id}`}
            onClick={(e) => {
              setTab(id);
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-element px-4 text-13 font-bold transition-colors',
              tab === id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
            )}
          >
            {label}
            {count > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
                  tab === id ? 'bg-background text-foreground' : 'bg-foreground text-background',
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${idBase}-panel-${tab}`} aria-labelledby={`${idBase}-tab-${tab}`}>
        {panel}
      </div>
    </>
  );
}
