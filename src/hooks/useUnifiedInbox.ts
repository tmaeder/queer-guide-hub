import { useMemo } from 'react';
import { useMailbox, type MailboxEmail } from '@/hooks/useMailbox';
import { useNotifications } from '@/hooks/useNotifications';

export type InboxItemType = 'dm' | 'email' | 'notification';

export interface UnifiedInboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  snippet: string;
  from: string;
  fromAvatar?: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  actionUrl: string;
  raw: MailboxEmail | unknown;
}

export const useUnifiedInbox = (filter?: InboxItemType | 'all') => {
  const mailbox = useMailbox();
  const { notifications, unreadCount: notifUnread } = useNotifications();

  const items = useMemo(() => {
    const merged: UnifiedInboxItem[] = [];

    // Emails from mailbox
    if (!filter || filter === 'all' || filter === 'email') {
      for (const e of mailbox.emails) {
        merged.push({
          id: e.id,
          type: 'email',
          title: e.subject,
          snippet: e.snippet || '',
          from: e.from_name || e.from_address,
          date: e.email_date,
          isRead: e.is_read,
          isStarred: e.is_starred,
          actionUrl: `/inbox/email/${e.id}`,
          raw: e,
        });
      }
    }

    // Notifications
    if (!filter || filter === 'all' || filter === 'notification') {
      for (const n of notifications) {
        merged.push({
          id: n.id,
          type: 'notification',
          title: n.title || 'Notification',
          snippet: n.content || '',
          from: 'System',
          date: n.created_at,
          isRead: n.read ?? false,
          isStarred: false,
          actionUrl: n.action_url || '#',
          raw: n,
        });
      }
    }

    // Sort by date, newest first
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return merged;
  }, [mailbox.emails, notifications, filter]);

  const totalUnread = mailbox.unreadCount + notifUnread;

  return {
    items,
    totalUnread,
    mailbox,
    loading: mailbox.loading,
  };
};
