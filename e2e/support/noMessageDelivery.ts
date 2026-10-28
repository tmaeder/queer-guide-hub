import type { BrowserContext, Route } from '@playwright/test';

const MESSAGE_ID = 'e2e00000-0000-4000-8000-0000000000f0';
const OUTBOX_ID = 'e2e00000-0000-4000-8000-0000000000f1';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};
const readOnly = (method: string) => ['GET', 'HEAD', 'OPTIONS'].includes(method);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function payload(route: Route): unknown {
  try {
    return route.request().postDataJSON();
  } catch {
    return null;
  }
}

/** Browser-only transport fixtures: never enqueue email, notifications or push. */
export async function preventMessageDelivery(context: BrowserContext, conversationId: string) {
  const state = {
    mailRequests: [] as unknown[],
    mailFulfilled: 0,
    chatRequests: [] as Record<string, unknown>[],
    reactionRequests: [] as Record<string, unknown>[],
    blockedWrites: [] as string[],
    messageId: MESSAGE_ID,
  };
  let reactions: Record<string, unknown>[] = [];
  const deny = async (route: Route) => {
    const request = route.request();
    state.blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
    await route.abort('blockedbyclient');
  };

  await context.route(/\/functions\/v1\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!/email|mailbox|notifications|trip-invitations/i.test(path)) return route.fallback();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (readOnly(request.method())) return route.fallback();
    if (request.method() !== 'POST' || !path.endsWith('/send-mailbox-email')) return deny(route);
    state.mailRequests.push(payload(route));
    // A valid pending receipt closes the composer without claiming delivery or
    // inventing a persisted Sent copy. No request reaches the edge function.
    await route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        success: true,
        outbox_id: OUTBOX_ID,
        email_id: null,
        delivery_status: 'pending',
      },
    });
    state.mailFulfilled++;
  });

  await context.route(/\/auth\/v1\/(?:recover|signup|otp|invite|resend)(?:\?|$)/, async (route) => {
    if (readOnly(route.request().method())) return route.fallback();
    return deny(route);
  });

  await context.route(
    /\/rest\/v1\/(?:messages|message_reactions|email_outbox)(?:\?|$)/,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').at(-1);
      const method = request.method();
      const syntheticReaction =
        table === 'message_reactions' && url.searchParams.get('message_id') === `eq.${MESSAGE_ID}`;
      if (method === 'GET' && syntheticReaction)
        return route.fulfill({ status: 200, headers: CORS, json: reactions });
      if (readOnly(method)) return route.fallback();
      const body = payload(route);
      if (
        table === 'messages' &&
        method === 'POST' &&
        object(body) &&
        body.conversation_id === conversationId &&
        typeof body.sender_id === 'string' &&
        typeof body.content === 'string'
      ) {
        state.chatRequests.push(body);
        const now = new Date().toISOString();
        return route.fulfill({
          status: 201,
          headers: CORS,
          json: {
            ...body,
            id: MESSAGE_ID,
            created_at: now,
            updated_at: now,
            edited_at: null,
            deleted_at: null,
          },
        });
      }
      if (
        table === 'message_reactions' &&
        method === 'POST' &&
        object(body) &&
        body.message_id === MESSAGE_ID &&
        typeof body.user_id === 'string' &&
        typeof body.emoji === 'string'
      ) {
        state.reactionRequests.push(body);
        reactions = [{ ...body, id: OUTBOX_ID, created_at: new Date().toISOString() }];
        return route.fulfill({ status: 201, headers: CORS, json: null });
      }
      if (method === 'DELETE' && syntheticReaction) {
        reactions = [];
        return route.fulfill({ status: 204, headers: CORS });
      }
      return deny(route);
    },
  );
  return state;
}
