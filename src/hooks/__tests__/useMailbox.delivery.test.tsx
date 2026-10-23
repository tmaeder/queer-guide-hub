import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  user: { id: 'fixture-owner' },
  toast: vi.fn(),
  fetch: vi.fn(),
  sessionUserId: 'fixture-owner',
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], count: 0, error: null }),
    then: (f: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(f),
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    SUPABASE_URL: 'https://fixture.invalid',
    supabase: {
      from: () => chain,
      channel: () => channel,
      removeChannel: vi.fn(),
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: { access_token: 'fixture-auth', user: { id: mocks.sessionUserId } } },
          }),
      },
    },
  };
});
import { useMailbox } from '../useMailbox';
const message = { to: 'recipient@example.com', subject: 'Requested reply', body_text: 'Fixture' };
beforeEach(() => {
  mocks.sessionUserId = mocks.user.id;
  mocks.fetch.mockReset();
  mocks.toast.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());
it('reuses the request identity after a lost response and says submitted for provider acceptance', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('Lost response')).mockImplementationOnce(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          outbox_id: 'fixture-outbox',
          email_id: 'fixture-copy',
          delivery_status: 'accepted',
        }),
      ),
    ),
  );
  const { result } = renderHook(() => useMailbox());
  await act(async () => {
    await expect(result.current.sendEmail(message)).rejects.toThrow('Lost response');
  });
  await act(async () => {
    await result.current.sendEmail(message);
  });
  const requests = mocks.fetch.mock.calls.map((c) => JSON.parse(c[1].body));
  expect(requests[0].request_id).toMatch(/^[a-f0-9-]{36}$/i);
  expect(requests[1].request_id).toBe(requests[0].request_id);
  expect(mocks.toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Email submitted' }),
  );
});
it('only reports delivered when the server has an actual delivered status', async () => {
  mocks.fetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          outbox_id: 'fixture-outbox',
          email_id: 'fixture-copy',
          delivery_status: 'delivered',
        }),
      ),
    ),
  );
  const { result } = renderHook(() => useMailbox());
  await act(async () => {
    await result.current.sendEmail(message);
  });
  expect(mocks.toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Email delivered' }),
  );
});
it('keeps pending confirmation distinct and starts a new identity for a later explicit send', async () => {
  mocks.fetch.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          outbox_id: 'fixture-outbox',
          email_id: 'fixture-copy',
          delivery_status: 'pending',
        }),
        { status: 202 },
      ),
    ),
  );
  const { result } = renderHook(() => useMailbox());
  await act(async () => {
    await result.current.sendEmail(message);
  });
  expect(mocks.toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Delivery confirmation pending' }),
  );
  await act(async () => {
    await result.current.sendEmail(message);
  });
  expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).request_id).not.toBe(
    JSON.parse(mocks.fetch.mock.calls[0][1].body).request_id,
  );
});

it('refuses a session that changed accounts before sending', async () => {
  mocks.sessionUserId = 'different-account';
  const { result } = renderHook(() => useMailbox());
  await act(async () => {
    await expect(result.current.sendEmail(message)).rejects.toThrow('Your account changed');
  });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('retains the retry identity when the response lacks a canonical outbox receipt', async () => {
  mocks.fetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ success: true, delivery_status: 'accepted' }))),
  );
  const { result } = renderHook(() => useMailbox());
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => {
      await expect(result.current.sendEmail(message)).rejects.toThrow('Invalid delivery response');
    });
  }
  expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).request_id).toBe(
    JSON.parse(mocks.fetch.mock.calls[0][1].body).request_id,
  );
  expect(mocks.toast).not.toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Email submitted' }),
  );
});
