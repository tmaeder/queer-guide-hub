import { untypedFrom } from '@/integrations/supabase/untyped';
import { mailboxSelection } from './mailboxSelection';
import type { InboxItem } from '@/hooks/useInboxFeed';

interface MailMetadata {
  id: string;
  direction: 'inbound' | 'outbound';
  subject: string;
  snippet: string | null;
  email_date: string;
  is_read: boolean;
}
export interface MailCursor {
  ts: string;
  id: string;
}

/** Owner/RLS-scoped metadata only. Sent mail does not belong in the unread badge. */
export async function fetchMailboxFeed(
  ownerId: string,
  cursor: MailCursor | null,
  signal: AbortSignal,
): Promise<InboxItem[]> {
  let query = untypedFrom('mailbox_emails')
    .select('id,direction,subject,snippet,email_date,is_read')
    .eq('owner_id', ownerId)
    .in('folder', ['inbox', 'sent'])
    .is('deleted_at', null)
    .order('email_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);
  if (cursor) {
    const selected = cursor.id.startsWith('mail_') ? mailboxSelection(cursor.id.slice(5)) : null;
    // Preserve microseconds: converting through Date would truncate timestamps
    // and skip messages that share the final millisecond of the previous page.
    if (
      !selected ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.ts) ||
      !Number.isFinite(Date.parse(cursor.ts))
    ) {
      throw new Error('Invalid mailbox cursor');
    }
    const id = selected.id.slice(5);
    query = query
      .lte('email_date', cursor.ts)
      .or(`email_date.lt.${cursor.ts},and(email_date.eq.${cursor.ts},id.lt.${id})`);
  }
  const { data, error } = await query.abortSignal(signal);
  if (error) throw new Error('Mailbox messages could not load');
  return ((data ?? []) as unknown as MailMetadata[]).map((row) => {
    const item = mailboxSelection(row.id);
    if (!item) throw new Error('Invalid mailbox reference');
    return {
      ...item,
      subtype: row.direction,
      title: row.subject,
      preview: row.snippet ?? '',
      ts: row.email_date,
      unread: row.direction === 'inbound' && !row.is_read,
      last_sender_is_me: row.direction === 'outbound',
    };
  });
}
