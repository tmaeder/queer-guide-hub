import { expect, it, vi } from 'vitest';
import type { BrowserContext, Route } from '@playwright/test';
import { preserveInboxFixtures } from '../../e2e/support/inboxFixtureTransport';

const ids = { ownerId: 'reviewer', conversationId: 'seed-chat', mailIds: ['seed-mail'] };
async function fixture() {
  let handler!: (route: Route) => Promise<unknown>;
  const state = await preserveInboxFixtures(
    {
      route: async (_pattern: RegExp, callback: typeof handler) => {
        handler = callback;
      },
    } as unknown as BrowserContext,
    ids,
  );
  async function dispatch(method: string, path: string, body: unknown = null, rows: unknown = []) {
    const response = { ok: () => true, json: async () => rows };
    const route = {
      request: () => ({
        url: () => `https://fixture.invalid/rest/v1/${path}`,
        method: () => method,
        postDataJSON: () => body,
      }),
      fulfill: vi.fn(),
      abort: vi.fn(),
      fallback: vi.fn(),
      fetch: vi.fn(async () => response),
      continue: vi.fn(),
    };
    await handler(route as unknown as Route);
    expect(route.continue).not.toHaveBeenCalled();
    if (method !== 'GET') expect(route.fetch).not.toHaveBeenCalled();
    return route;
  }
  return { state, dispatch };
}

it('keeps ordinary reviewer-scoped reads real until a local fixture action occurs', async () => {
  const { dispatch } = await fixture();
  const route = await dispatch('GET', 'mailbox_emails?owner_id=eq.reviewer');
  expect(route.fallback).toHaveBeenCalledOnce();
  expect(route.fetch).not.toHaveBeenCalled();
});

it('captures an archive request without forwarding a PATCH and preserves the original read row', async () => {
  const { state, dispatch } = await fixture();
  const write = await dispatch('PATCH', 'mailbox_emails?id=eq.seed-mail&owner_id=eq.reviewer', {
    folder: 'archive',
  });
  expect(write.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 204 }));
  expect(write.fallback).not.toHaveBeenCalled();
  expect(state.folderRequests).toEqual([{ id: 'seed-mail', folder: 'archive' }]);
  const original = { id: 'seed-mail', folder: 'inbox', subject: 'Existing fixture' };
  const read = await dispatch('GET', 'mailbox_emails?id=eq.seed-mail', null, original);
  expect(read.fetch).toHaveBeenCalledOnce();
  expect(read.fulfill.mock.calls[0][0].json).toEqual({ ...original, folder: 'archive' });
  expect(original.folder).toBe('inbox');
});

it('removes only the locally moved row from fresh Inbox/Sent metadata reads', async () => {
  const { dispatch } = await fixture();
  await dispatch('PATCH', 'mailbox_emails?id=eq.seed-mail&owner_id=eq.reviewer', {
    folder: 'trash',
  });
  const rows = [
    { id: 'seed-mail', subject: 'Deleted locally' },
    { id: 'another', subject: 'Real mail' },
  ];
  const read = await dispatch('GET', 'mailbox_emails?folder=in.(inbox,sent)', null, rows);
  expect(read.fulfill.mock.calls[0][0].json).toEqual([rows[1]]);
  expect(rows).toHaveLength(2);
});

it.each([
  ['mailbox_emails?id=eq.someone-else&owner_id=eq.reviewer', { folder: 'archive' }],
  ['mailbox_emails?id=eq.seed-mail&owner_id=eq.other-owner', { folder: 'archive' }],
  ['mailbox_emails?id=eq.seed-mail&owner_id=eq.reviewer', { folder: 'inbox' }],
  [
    'mailbox_emails?id=eq.seed-mail&owner_id=eq.reviewer',
    { folder: 'archive', subject: 'Changed' },
  ],
  [
    'conversation_participants?conversation_id=eq.other&user_id=eq.reviewer',
    { last_read_at: '2026-10-29T00:00:00Z' },
  ],
])('blocks out-of-scope or unexpected fixture PATCH %s', async (path, body) => {
  const { state, dispatch } = await fixture();
  const route = await dispatch('PATCH', path, body);
  expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
  expect(route.fallback).not.toHaveBeenCalled();
  expect(state.blockedWrites).toHaveLength(1);
});

it('handles read markers locally only for the known reviewer-owned fixtures', async () => {
  const { state, dispatch } = await fixture();
  for (const [path, body] of [
    ['mailbox_emails?id=eq.seed-mail&owner_id=eq.reviewer', { is_read: true }],
    [
      'conversation_participants?conversation_id=eq.seed-chat&user_id=eq.reviewer',
      { last_read_at: '2026-10-29T00:00:00Z' },
    ],
  ] as const) {
    const route = await dispatch('PATCH', path, body);
    expect(route.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 204 }));
    expect(route.fallback).not.toHaveBeenCalled();
  }
  expect(state.blockedWrites).toEqual([]);
});

it('renders both availability transitions from local RPC receipts without changing production', async () => {
  const { state, dispatch } = await fixture();
  const path = 'conversation_availability?conversation_id=eq.seed-chat';
  const initial = await dispatch('GET', path);
  expect(initial.fulfill.mock.calls[0][0].json).toEqual([]);
  for (const minutes of [60, 0]) {
    const write = await dispatch('POST', 'rpc/set_conversation_availability', {
      p_conversation_id: ids.conversationId,
      p_minutes: minutes,
    });
    expect(write.fallback).not.toHaveBeenCalled();
    const read = await dispatch('GET', path);
    const rows = read.fulfill.mock.calls[0][0].json;
    expect(rows).toHaveLength(minutes ? 1 : 0);
    if (minutes) expect(rows[0]).toMatchObject({ user_id: ids.ownerId });
  }
  expect(state.availabilityRequests).toEqual([60, 0]);
});

it('blocks an availability RPC for any other conversation', async () => {
  const { dispatch } = await fixture();
  const route = await dispatch('POST', 'rpc/set_conversation_availability', {
    p_conversation_id: 'other',
    p_minutes: 60,
  });
  expect(route.abort).toHaveBeenCalledOnce();
  expect(route.fallback).not.toHaveBeenCalled();
});
