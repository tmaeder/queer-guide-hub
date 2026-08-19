import { Bell, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { SignalPanel } from './SignalPanel';

export const NotificationBell = () => {
  const { t } = useTranslation();
  // Alerts lens only (2026-07 declutter): the badge counts unread alerts in
  // the same feed the SignalPanel popover renders, so they never desync.
  // Chat/mail unread stays on the hub nav + mobile bottom-nav badges.
  const { items } = useInboxFeed('alerts');
  const unreadCount = items.filter((i) => i.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? t('header.notifications.unread', {
                  count: unreadCount,
                  defaultValue: 'Notifications, {{count}} unread',
                })
              : t('header.notifications.label', 'Notifications')
          }
        >
          {unreadCount > 0 ? <BellRing size={20} /> : <Bell size={20} />}
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              // Magenta, per the spec's bell badge — the one place the count
              // rides the flagship track rather than the achromatic ink used
              // by the inbox rail's per-row counts. Type on it is
              // `--track-ring` for the same reason every other track fill
              // takes it (see TRACK_TEXT): the fill is identity and does not
              // flip with the mode, so its type must not either. The 1px rim
              // is the WCAG 1.4.11 gate every track-coloured mark carries.
              className="border absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-badge border-track-ring bg-track-pink px-1 text-2xs font-bold leading-none text-track-ring"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      {/* An island, not a menu ("Popovers are islands too", panel 05): paper
          surface, 18px radius, heavy shadow, no caret. `p-0` because the
          panel's own footer strip is a full-bleed band that has to reach the
          rounded edges — the default 4px menu padding would leave a paper
          hairline around it. */}
      <DropdownMenuContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] bg-card p-0 shadow-soft-lg backdrop-blur-none"
        style={{ zIndex: 50 }}
      >
        <SignalPanel />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
