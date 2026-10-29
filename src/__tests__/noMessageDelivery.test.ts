import { expect, it, vi } from 'vitest';
import type { BrowserContext, Route } from '@playwright/test';
import { preventMessageDelivery } from '../../e2e/support/noMessageDelivery';

const conversation = 'e2e00000-0000-4000-8000-0000000000c0';
async function fixture() {
  const routes: { pattern: RegExp; handler: (route: Route) => Promise<unknown> }[] = [];
  const context = {
    route: async (pattern: RegExp, handler: (route: Route) => Promise<unknown>) => {
      routes.push({ pattern, handler });
    },
  };
  const state = await preventMessageDelivery(context as unknown as BrowserContext, conversation);
  const dispatch = async (method: string, path: string, body: unknown = null) => {
    const url = `https://fixture.invalid${path}`;
    const route = {
      request: () => ({ url: () => url, method: () => method, postDataJSON: () => body }),
      fulfill: vi.fn(),
      abort: vi.fn(),
      fallback: vi.fn(),
      fetch: vi.fn(),
      continue: vi.fn(),
    };
    const handler = [...routes].reverse().find(({ pattern }) => pattern.test(url))?.handler;
    expect(handler, 'Guard must match this delivery surface').toBeDefined();
    await handler!(route as unknown as Route);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.continue).not.toHaveBeenCalled();
    return route;
  };
  return { state, dispatch };
}

it('fulfills mailbox POST locally with a valid non-delivery receipt and preserves its payload', async () => {
  const { state, dispatch } = await fixture();
  const body = { to: 'recipient@example.invalid', subject: 'Fixture', body_text: 'No delivery' };
  const route = await dispatch('POST', '/functions/v1/send-mailbox-email', body);
  expect(route.fallback).not.toHaveBeenCalled();
  expect(route.abort).not.toHaveBeenCalled();
  expect(state.mailRequests).toEqual([body]);
  expect(state.mailFulfilled).toBe(1);
  expect(route.fulfill.mock.calls[0][0]).toMatchObject({
    status: 200,
    json: {
      success: true,
      delivery_status: 'pending',
      email_id: null,
    },
  });
});

it('handles the email preflight locally while allowing existing receipt reads', async () => {
  const { state, dispatch } = await fixture();
  const options = await dispatch('OPTIONS', '/functions/v1/send-mailbox-email');
  expect(options.fulfill).toHaveBeenCalledWith(expect.objectContaining({ status: 204 }));
  expect(options.fallback).not.toHaveBeenCalled();
  const read = await dispatch('GET', '/functions/v1/send-mailbox-email?email_id=fixture');
  expect(read.fallback).toHaveBeenCalledOnce();
  expect(state.mailRequests).toEqual([]);
});

it.each(['send-email', 'email-dispatch', 'notifications', 'trip-invitations'])(
  'blocks an unexpected delivery function %s rather than forwarding it',
  async (name) => {
    const { state, dispatch } = await fixture();
    const route = await dispatch('POST', `/functions/v1/${name}`, {});
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(route.fallback).not.toHaveBeenCalled();
    expect(state.blockedWrites).toEqual([`POST /functions/v1/${name}`]);
  },
);

it.each(['recover', 'signup', 'otp', 'invite', 'resend'])(
  'blocks auth email generation through %s',
  async (endpoint) => {
    const { dispatch } = await fixture();
    const route = await dispatch('POST', `/auth/v1/${endpoint}`, {});
    expect(route.abort).toHaveBeenCalledOnce();
    expect(route.fallback).not.toHaveBeenCalled();
  },
);

it('blocks direct outbox insertion', async () => {
  const { dispatch } = await fixture();
  const route = await dispatch('POST', '/rest/v1/email_outbox', {});
  expect(route.abort).toHaveBeenCalledOnce();
  expect(route.fallback).not.toHaveBeenCalled();
});

it('simulates message persistence and reaction rendering without DB notification/digest triggers', async () => {
  const { state, dispatch } = await fixture();
  const body = { conversation_id: conversation, sender_id: 'test-user', content: 'Fixture text' };
  const message = await dispatch('POST', '/rest/v1/messages?select=*', body);
  expect(message.fallback).not.toHaveBeenCalled();
  expect(message.fulfill.mock.calls[0][0]).toMatchObject({
    status: 201,
    json: { id: state.messageId, ...body },
  });
  const reaction = { message_id: state.messageId, user_id: 'test-user', emoji: '👍' };
  const write = await dispatch('POST', '/rest/v1/message_reactions', reaction);
  expect(write.fallback).not.toHaveBeenCalled();
  const query = `/rest/v1/message_reactions?message_id=eq.${state.messageId}`;
  const read = await dispatch('GET', query);
  expect(read.fulfill.mock.calls[0][0].json).toEqual([expect.objectContaining(reaction)]);
  expect(state.chatRequests).toEqual([body]);
  expect(state.reactionRequests).toEqual([reaction]);
  await dispatch('DELETE', query);
  const empty = await dispatch('GET', query);
  expect(empty.fulfill.mock.calls[0][0].json).toEqual([]);
});

it('blocks a message targeting a different conversation', async () => {
  const { state, dispatch } = await fixture();
  const route = await dispatch('POST', '/rest/v1/messages', {
    conversation_id: 'different',
    sender_id: 'test-user',
    content: 'Never send',
  });
  expect(route.abort).toHaveBeenCalledOnce();
  expect(route.fallback).not.toHaveBeenCalled();
  expect(state.chatRequests).toEqual([]);
});

it('keeps existing inbox reads available', async () => {
  const { dispatch } = await fixture();
  const read = await dispatch('GET', '/rest/v1/messages?conversation_id=eq.existing');
  expect(read.fallback).toHaveBeenCalledOnce();
  expect(read.fulfill).not.toHaveBeenCalled();
});
