import type { BrowserContext, Route } from '@playwright/test';

type FixtureIds = {
  ownerId: string;
  conversationId: string;
  mailIds: readonly string[];
};
const readOnly = (method: string) => ['GET', 'HEAD', 'OPTIONS'].includes(method);
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PATCH, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, prefer',
};

/** Keep fixture actions local while reading the real, reviewer-scoped inbox. */
export async function preserveInboxFixtures(context: BrowserContext, ids: FixtureIds) {
  const state = {
    blockedWrites: [] as string[],
    folderRequests: [] as { id: string; folder: string }[],
    availabilityRequests: [] as number[],
  };
  const mailPatches = new Map<string, Record<string, unknown>>();
  let available = false;
  await context.route(
    /\/rest\/v1\/(?:mailbox_emails|conversation_participants|conversation_availability|rpc\/set_conversation_availability)(?:\?|$)/,
    async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const table = url.pathname.split('/').at(-1);
      const method = request.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (readOnly(method)) {
        if (
          method === 'GET' &&
          table === 'conversation_availability' &&
          url.searchParams.get('conversation_id') === `eq.${ids.conversationId}`
        )
          return route.fulfill({
            status: 200,
            headers: CORS,
            json: available
              ? [
                  {
                    user_id: ids.ownerId,
                    available_until: new Date(Date.now() + 3_600_000).toISOString(),
                  },
                ]
              : [],
          });
        if (method !== 'GET' || table !== 'mailbox_emails' || mailPatches.size === 0)
          return route.fallback();
        // Only GET reaches production. Apply this test's captured folder moves
        // to fresh reads too, so reload assertions cannot pass on a loading rail.
        const response = await route.fetch();
        if (!response.ok()) return route.fulfill({ response });
        const data: unknown = await response.json();
        const patch = (row: unknown) =>
          object(row) && typeof row.id === 'string' ? { ...row, ...mailPatches.get(row.id) } : row;
        const folder = url.searchParams.get('folder');
        const included = (row: unknown) => {
          if (!folder || !object(row) || typeof row.folder !== 'string') return true;
          if (folder.startsWith('eq.')) return row.folder === folder.slice(3);
          if (folder.startsWith('in.(')) return folder.slice(4, -1).split(',').includes(row.folder);
          throw new Error('Unsupported fixture mailbox folder filter');
        };
        return route.fulfill({
          response,
          json: Array.isArray(data) ? data.map(patch).filter(included) : patch(data),
        });
      }
      let body: unknown;
      try {
        body = request.postDataJSON();
      } catch {
        body = null;
      }
      if (object(body)) {
        const keys = Object.keys(body);
        const mailId = ids.mailIds.find((id) => url.searchParams.get('id') === `eq.${id}`);
        if (
          table === 'mailbox_emails' &&
          method === 'PATCH' &&
          mailId &&
          url.searchParams.get('owner_id') === `eq.${ids.ownerId}` &&
          keys.length === 1 &&
          ((body.is_read === true && keys[0] === 'is_read') ||
            (keys[0] === 'folder' && ['archive', 'trash'].includes(String(body.folder))))
        ) {
          mailPatches.set(mailId, { ...mailPatches.get(mailId), ...body });
          if (typeof body.folder === 'string')
            state.folderRequests.push({ id: mailId, folder: body.folder });
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (
          table === 'conversation_participants' &&
          method === 'PATCH' &&
          url.searchParams.get('conversation_id') === `eq.${ids.conversationId}` &&
          url.searchParams.get('user_id') === `eq.${ids.ownerId}` &&
          keys.length === 1 &&
          typeof body.last_read_at === 'string' &&
          Number.isFinite(Date.parse(body.last_read_at))
        )
          return route.fulfill({ status: 204, headers: CORS });
        if (
          table === 'set_conversation_availability' &&
          method === 'POST' &&
          keys.length === 2 &&
          body.p_conversation_id === ids.conversationId &&
          typeof body.p_minutes === 'number' &&
          [0, 60].includes(body.p_minutes)
        ) {
          available = body.p_minutes === 60;
          state.availabilityRequests.push(body.p_minutes);
          return route.fulfill({ status: 200, headers: CORS, json: null });
        }
      }
      state.blockedWrites.push(`${method} ${url.pathname}`);
      return route.abort('blockedbyclient');
    },
  );
  return state;
}
