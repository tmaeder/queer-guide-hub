import { test, expect } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

/**
 * Spots P0 (docs/superpowers/specs/2026-11-22-spots-unification-design.md).
 *
 * public.spots mirrors every venue and organization, safety-gated and draft rows included,
 * so in P0 it must be unreadable to the public. Public access arrives in P3 through definer
 * RPCs that apply the gate. A grant added "just to try something" would publish every gated
 * venue in a criminalizing country to anonymous visitors.
 *
 * The positive control matters: "anon got no spots rows" also passes when PostgREST is down
 * or the key is wrong, so the same request context must read a venue first.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';

test('positive control: anon can read venues through the same context', async ({ request }) => {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/venues?select=id&limit=1`, {
    headers: await anonHeaders(request),
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).length).toBe(1);
});

test('anon cannot read the spots spine', async ({ request }) => {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/spots?select=id&limit=1`, {
    headers: await anonHeaders(request),
  });
  // Deployed: 401 permission denied. Not yet deployed: 404. Never a row.
  expect([401, 403, 404]).toContain(res.status());
});

test('anon cannot run or read the drift check', async ({ request }) => {
  const headers = { ...(await anonHeaders(request)), 'Content-Type': 'application/json' };
  const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/spots_drift_check`, { headers, data: {} });
  expect(rpc.ok()).toBe(false);
  const log = await request.get(`${SUPABASE_URL}/rest/v1/spots_drift_log?select=id&limit=1`, { headers });
  expect([401, 403, 404]).toContain(log.status());
});
