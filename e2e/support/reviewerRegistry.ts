import { readFile } from 'node:fs/promises';
import { expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './anonKey';
import { authenticated } from './adminAuth';

let renewedSession: { sourceToken: string; accessToken: string } | undefined;

async function renewReviewer(
  request: APIRequestContext,
  headers: Awaited<ReturnType<typeof anonHeaders>>,
  session: { access_token: string; refresh_token?: string },
): Promise<string> {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  // A long suite's browsers may already have rotated the saved refresh token.
  // CI can sign in independently with its configured reviewer credentials;
  // externally supplied storage states use their refresh token instead.
  const credentials = email && password;
  if (!credentials && !session.refresh_token)
    throw new Error('Configured reviewer session expired and cannot be renewed');

  let accessToken: unknown;
  try {
    const response = await request.post(
      `${SUPABASE_REST_URL}/auth/v1/token?grant_type=${credentials ? 'password' : 'refresh_token'}`,
      {
        headers,
        data: credentials ? { email, password } : { refresh_token: session.refresh_token },
        timeout: 20_000,
      },
    );
    if (!response.ok()) throw new Error('Rejected');
    accessToken = (await response.json()).access_token;
  } catch {
    // Never include request bodies, response bodies or credentials in failures.
    throw new Error('Configured reviewer session renewal failed');
  }
  if (typeof accessToken !== 'string' || !accessToken)
    throw new Error('Reviewer session renewal returned no access token');
  renewedSession = { sourceToken: session.access_token, accessToken };
  return accessToken;
}

// Content invariants for sensitive glossary rows require the configured reviewer
// session. Anonymous visibility is tested separately; never loosen RLS to make a
// historical content fixture readable. Do not log the stored session or headers.
export async function reviewerTagRows<T>(request: APIRequestContext, query: string): Promise<T[]> {
  const publicHeaders = await anonHeaders(request);
  const headers = { ...publicHeaders };
  let session: { access_token: string; refresh_token?: string } | null = null;
  if (authenticated) {
    const state = JSON.parse(
      await readFile(process.env.E2E_STORAGE_STATE || 'playwright/.auth/admin.json', 'utf8'),
    );
    const origin = state.origins.find(
      (item: { origin: string }) =>
        item.origin === new URL(process.env.E2E_BASE_URL || 'https://queer.guide').origin,
    );
    const sessionEntry = origin?.localStorage.find((item: { name: string }) =>
      /^sb-.*-auth-token$/.test(item.name),
    );
    session = sessionEntry ? JSON.parse(sessionEntry.value) : null;
    if (!session?.access_token)
      throw new Error('Configured reviewer storage has no Supabase session');
    const token =
      renewedSession?.sourceToken === session.access_token
        ? renewedSession.accessToken
        : session.access_token;
    headers.Authorization = `Bearer ${token}`;
  }
  const url = `${SUPABASE_REST_URL}/rest/v1/unified_tags?${query}`;
  let response = await request.get(url, { headers });
  if (session && response.status() === 401) {
    headers.Authorization = `Bearer ${await renewReviewer(request, publicHeaders, session)}`;
    response = await request.get(url, { headers });
  }
  expect(response.ok(), 'Reviewer glossary registry must be readable').toBe(true);
  return response.json();
}

export { authenticated as hasReviewerSession };
