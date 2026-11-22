import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Inbox, PenSquare } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useInboxFeed, useInboxRealtime, useInboxUnreadCounts } from '@/hooks/useInboxFeed';
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

export interface HeaderInboxProps {
  /** `true` on the compact header's ink plate — `ghost` would render ink on ink. */
  onInk?: boolean;
}

/**
 * The header's one inbox entry (replaced the alerts-only bell 2026-11-22).
 * Badge = everything unread. The popover splits it into Messages (chats, mail,
 * trip mail) and Alerts (the Signal panel); a safety notice pins above both.
 * Also mounts the user's inbox realtime channel, since the header is on every
 * signed-in screen.
 */
export const HeaderInbox = ({ onInk = false }: HeaderInboxProps = {}) => {
  const { t } = useTranslation();
  useInboxRealtime();
  const counts = useInboxUnreadCounts();
  const alertCount = counts.alerts;
  const messageCount = Math.max(counts.all - counts.alerts, 0);
  const total = counts.all;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<InboxTab>('messages');

  const onOpenChange = (next: boolean) => {
    // Open on whichever lane has something new; messages first.
    if (next) setTab(messageCount === 0 && alertCount > 0 ? 'alerts' : 'messages');
    setOpen(next);
  };

  const tabs: { id: InboxTab; label: string; count: number }[] = [
    { id: 'messages', label: t('inbox.tabs.messages', 'Messages'), count: messageCount },
    { id: 'alerts', label: t('inbox.tabs.alerts', 'Alerts'), count: alertCount },
  ];

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={onInk ? 'ghostReversed' : 'ghost'}
          size="icon"
          className="relative"
          aria-label={
            total > 0
              ? t('header.inbox.unread', {
                  count: total,
                  defaultValue: 'Inbox, {{count}} unread',
                })
              : t('header.inbox.label', 'Inbox')
          }
        >
          <Inbox size={20} />
          {total > 0 && (
            <span
              aria-hidden="true"
              // Magenta on the flagship track with `--track-ring` type (the
              // fill does not flip with the mode, so its type must not
              // either). `-end-1` so RTL pins it to the right corner.
              className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-badge bg-track-pink px-1 text-2xs font-bold leading-none text-track-ring"
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* An island, not a menu: paper surface, heavy shadow, no caret. `p-0`
          so the footer strips reach the rounded edges. */}
      <DropdownMenuContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] bg-card p-0 shadow-soft-lg backdrop-blur-none"
        style={{ zIndex: 50 }}
      >
        <div className="pt-4">
          <SafetyNotices />
        </div>
        <div role="tablist" className="flex gap-1 px-2 pb-1">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`header-inbox-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`header-inbox-panel-${id}`}
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
        <div
          role="tabpanel"
          id={`header-inbox-panel-${tab}`}
          aria-labelledby={`header-inbox-tab-${tab}`}
        >
          {tab === 'messages' ? (
            <MessagesPeek onNavigate={() => setOpen(false)} />
          ) : (
            <SignalPanel embedded />
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
