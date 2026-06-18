import { Bell, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { NotificationList } from './NotificationList';

export const NotificationBell = () => {
  const { t } = useTranslation();
  // Same source as the unified inbox so the bell count never desyncs from
  // /messages or the NotificationList feed it opens.
  const { unreadCount } = useInboxFeed('all');

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
              className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-2xs font-medium leading-none text-background"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: 320, zIndex: 50 }}>
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
