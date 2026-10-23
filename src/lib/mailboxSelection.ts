import type { InboxItem } from '@/hooks/useInboxFeed';

/** Selection only: the owner-filtered reader must resolve all actual metadata. */
export function mailboxSelection(emailId: string): InboxItem | null {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(emailId)) return null;
  const id = emailId.toLowerCase();
  return {
    id: `mail_${id}`,
    kind: 'mail',
    subtype: '',
    title: '',
    preview: '',
    avatar_url: null,
    ts: '',
    unread: false,
    open_target: `/messages?email=${id}`,
    other_user_id: null,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    unread_count: 0,
    last_sender_is_me: null,
    last_message_subtype: null,
  };
}
