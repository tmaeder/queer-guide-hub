import { readFile } from 'node:fs/promises';
import { expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './anonKey';
import { authenticated } from './adminAuth';

// Content invariants for sensitive glossary rows require the configured reviewer
// session. Anonymous visibility is tested separately; never loosen RLS to make a
// historical content fixture readable. Do not log the stored session or headers.
export async function reviewerTagRows<T>(request: APIRequestContext, query: string): Promise<T[]> {
  const headers = await anonHeaders(request);
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
    const session = sessionEntry ? JSON.parse(sessionEntry.value) : null;
    if (!session?.access_token)
      throw new Error('Configured reviewer storage has no Supabase session');
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await request.get(`${SUPABASE_REST_URL}/rest/v1/unified_tags?${query}`, {
    headers,
  });
  expect(response.ok(), 'Reviewer glossary registry must be readable').toBe(true);
  return response.json();
}

export { authenticated as hasReviewerSession };
