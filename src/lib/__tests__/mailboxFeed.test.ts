import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  calls: [] as unknown[][],
  data: [] as unknown[],
  error: null as unknown,
  requested: 0,
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: (table: string) => {
    mock.calls.push(['from', table]);
    const query: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'in', 'is', 'order', 'limit', 'or', 'lte'])
      query[name] = (...args: unknown[]) => {
        mock.calls.push([name, ...args]);
        return query;
      };
    query.abortSignal = (signal: AbortSignal) => {
      mock.calls.push(['signal', signal]);
      mock.requested++;
      return Promise.resolve({ data: mock.data, error: mock.error });
    };
    return query;
  },
}));
import { fetchMailboxFeed } from '../mailboxFeed';
const id = '88888888-0000-4000-8000-000000000030';
beforeEach(() => {
  mock.calls = [];
  mock.data = [];
  mock.error = null;
  mock.requested = 0;
});
it('reads bounded owner-scoped received/Sent metadata without message bodies or draft/trash records', async () => {
  mock.data = [
    {
      id,
      direction: 'outbound',
      subject: 'Requested reply',
      snippet: 'Sent fixture',
      email_date: '2026-10-24T12:00:00.123456+00:00',
      is_read: false,
    },
    {
      id: '88888888-0000-4000-8000-000000000031',
      direction: 'inbound',
      subject: 'Reply',
      snippet: null,
      email_date: '2026-10-24T11:00:00Z',
      is_read: false,
    },
  ];
  const signal = new AbortController().signal;
  const items = await fetchMailboxFeed('owner-a', null, signal);
  expect(mock.calls).toContainEqual(['eq', 'owner_id', 'owner-a']);
  expect(mock.calls).toContainEqual(['in', 'folder', ['inbox', 'sent']]);
  expect(mock.calls).toContainEqual(['is', 'deleted_at', null]);
  expect(mock.calls).toContainEqual(['select', 'id,direction,subject,snippet,email_date,is_read']);
  expect(mock.calls).toContainEqual(['limit', 30]);
  expect(mock.calls).toContainEqual(['signal', signal]);
  expect(items[0]).toMatchObject({
    id: `mail_${id}`,
    subtype: 'outbound',
    unread: false,
    last_sender_is_me: true,
    preview: 'Sent fixture',
  });
  expect(items[1]).toMatchObject({ subtype: 'inbound', unread: true, preview: '' });
  expect(items[0]).not.toHaveProperty('body_html');
});
it('retains the complete timestamp and UUID tie-breaker when requesting the next page', async () => {
  const ts = '2026-10-24T12:00:00.123456+00:00';
  await fetchMailboxFeed('owner-a', { ts, id: `mail_${id}` }, new AbortController().signal);
  expect(mock.calls).toContainEqual([
    'or',
    `email_date.lt.${ts},and(email_date.eq.${ts},id.lt.${id})`,
  ]);
  expect(mock.calls).toContainEqual(['order', 'email_date', { ascending: false }]);
  expect(mock.calls).toContainEqual(['order', 'id', { ascending: false }]);
});
it('fails truthfully on read errors and rejects unsafe cursors before any request', async () => {
  mock.error = { message: 'private failure' };
  await expect(fetchMailboxFeed('owner-a', null, new AbortController().signal)).rejects.toThrow(
    'Mailbox messages could not load',
  );
  mock.requested = 0;
  for (const cursor of [
    { ts: '2026-10-24T12:00:00Z,owner_id.neq.x', id: `mail_${id}` },
    { ts: '2026-10-24T12:00:00Z', id: `conv_${id}` },
  ])
    await expect(fetchMailboxFeed('owner-a', cursor, new AbortController().signal)).rejects.toThrow(
      'Invalid mailbox cursor',
    );
  expect(mock.requested).toBe(0);
});
