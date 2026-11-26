import { useId, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { HUB_MODULES, type HubModuleId } from '@/config/hubModules';
import { MessagesPeek } from '@/components/notifications/MessagesPeek';
import { SafetyNotices, SignalPanel } from '@/components/notifications/SignalPanel';
import { useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { Bell, MessageCircle, type LucideIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { FeedPeek, FriendsPeek, PlansPeek, ProgressPeek, SavedPeek } from './HubPeeks';

/** Today is not a tab: it is the /hub page itself, and the other tabs already
 *  hold what it summarises. */
type SectionId = Exclude<HubModuleId, 'overview'>;
type TabId = 'messages' | 'alerts' | SectionId;
const SECTIONS = HUB_MODULES.filter(
  (m): m is (typeof HUB_MODULES)[number] & { id: SectionId } => m.id !== 'overview',
);

const SECTION_PEEK: Record<
  SectionId,
  ComponentType<{ onNavigate: () => void; openLabel: string }>
> = {
  plans: PlansPeek,
  saved: SavedPeek,
  friends: FriendsPeek,
  feed: FeedPeek,
  progress: ProgressPeek,
};

/**
 * The Hub menu's tabs: Messages, Alerts, then the Hub sections (Today excepted), each showing
 * its own latest items and a link to the full page. A safety notice pins above
 * them. Always opens on Messages. Only the selected tab mounts, so one section fetches
 * at a time.
 */
export function HubPanel({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const counts = useInboxUnreadCounts();
  const tripCount = useInboxBadge();
  const alertCount = counts.alerts;
  const messageCount = Math.max(counts.all - counts.alerts, 0);
  // Always opens on Messages; the badges on the other tabs say where else to look.
  const [tab, setTab] = useState<TabId>('messages');
  const idBase = useId();

  const tabs: { id: TabId; label: string; icon: LucideIcon; count: number }[] = [
    {
      id: 'messages',
      label: t('inbox.tabs.messages', 'Messages'),
      icon: MessageCircle,
      count: messageCount,
    },
    { id: 'alerts', label: t('inbox.tabs.alerts', 'Alerts'), icon: Bell, count: alertCount },
    ...SECTIONS.map((m) => ({
      id: m.id as TabId,
      label: t(m.labelKey, m.defaultLabel),
      icon: m.icon,
      count: m.id === 'plans' ? tripCount : 0,
    })),
  ];
  const label = (id: TabId) => tabs.find((x) => x.id === id)?.label ?? '';

  let panel;
  if (tab === 'messages') panel = <MessagesPeek onNavigate={onNavigate} />;
  else if (tab === 'alerts') panel = <SignalPanel embedded onNavigate={onNavigate} />;
  else {
    const Peek = SECTION_PEEK[tab];
    panel = <Peek onNavigate={onNavigate} openLabel={label(tab)} />;
  }

  return (
    <>
      {/* Reserves space only when a safety notice is actually showing. */}
      <div className="pt-4 empty:hidden">
        <SafetyNotices />
      </div>
      {/* Seven equal tabs, icon over label, all visible at once: no sideways
          scrolling. Labels truncate on the narrowest phones; the icon carries
          the meaning and the full label stays the accessible name. */}
      <div
        role="tablist"
        aria-label={t('header.mobileNav.hub', 'Hub')}
        className="grid grid-cols-7 p-1.5"
      >
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${idBase}-panel-${id}`}
            title={label}
            onClick={() => setTab(id)}
            className={cn(
              'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-element transition-colors',
              tab === id
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-surface-container-high hover:text-foreground',
            )}
          >
            <span className="relative flex">
              <Icon size={18} aria-hidden />
              {count > 0 && (
                <span
                  aria-hidden
                  className="absolute -end-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-track-pink px-1 text-2xs font-bold leading-none text-track-ring"
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-3xs font-bold leading-tight tracking-tight min-[400px]:text-2xs">
              {label}
            </span>
            {count > 0 && <span className="sr-only">, {count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${idBase}-panel-${tab}`} aria-labelledby={`${idBase}-tab-${tab}`}>
        {panel}
      </div>
    </>
  );
}
