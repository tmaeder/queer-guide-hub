import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, PenSquare } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useInboxFeed, useInboxUnreadCounts } from '@/hooks/useInboxFeed';
import { cn } from '@/lib/utils';
import { SafetyNotices, SignalPanel, SignalRow } from './SignalPanel';

type InboxTab = 'messages' | 'alerts';

function MessagesPeek({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { items, loading } = useInboxFeed('all');
  const rows = items.filter((i) => i.kind !== 'notification').slice(0, 8);

  return (
    <div className="w-full">
      {loading ? (
        <p className="px-4 py-6 text-center text-13 text-muted-foreground">
          {t('inbox.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-13 text-muted-foreground">
          {t('inbox.noMessages', { defaultValue: 'No messages yet.' })}
        </p>
      ) : (
        <ScrollArea style={{ maxHeight: 384 }}>
          <div className="flex flex-col gap-0.5 px-1.5 py-2">
            {rows.map((item) => (
              <SignalRow
                key={item.id}
                item={item}
                onSelect={(i) => {
                  onNavigate();
                  navigate(i.open_target);
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex items-center justify-between gap-2 rounded-b-container bg-surface-container px-2 py-1.5 text-xs font-bold">
        <LocalizedLink
          to="/messages"
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 no-underline transition-colors hover:bg-surface-container-high"
        >
          {t('inbox.openInbox', { defaultValue: 'Open inbox' })}
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
        <LocalizedLink
          to="/messages?compose=message"
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 text-muted-foreground no-underline transition-colors hover:bg-surface-container-high hover:text-foreground"
        >
          <PenSquare size={14} aria-hidden />
          {t('inbox.compose.message', { defaultValue: 'New message' })}
        </LocalizedLink>
      </div>
    </div>
  );
}

/**
 * Messages + Alerts, with a safety notice pinned above both. Shared by the
 * header Inbox popover (desktop) and the Hub sheet (phones), so the two can't
 * drift. Opens on whichever lane has something new; messages first.
 */
export function InboxPanel({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const counts = useInboxUnreadCounts();
  const alertCount = counts.alerts;
  const messageCount = Math.max(counts.all - counts.alerts, 0);
  const [tab, setTab] = useState<InboxTab>(() =>
    messageCount === 0 && alertCount > 0 ? 'alerts' : 'messages',
  );
  const idBase = useId();

  const tabs: { id: InboxTab; label: string; count: number }[] = [
    { id: 'messages', label: t('inbox.tabs.messages', 'Messages'), count: messageCount },
    { id: 'alerts', label: t('inbox.tabs.alerts', 'Alerts'), count: alertCount },
  ];

  return (
    <>
      <div className="pt-4">
        <SafetyNotices />
      </div>
      <div role="tablist" className="flex gap-1 px-2 pb-1">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`${idBase}-panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              'flex min-h-11 items-center gap-1.5 rounded-element px-4 text-13 font-bold transition-colors',
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
        {tab === 'messages' ? <MessagesPeek onNavigate={onNavigate} /> : <SignalPanel embedded />}
      </div>
    </>
  );
}
