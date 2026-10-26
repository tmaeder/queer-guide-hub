import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { waitForAppReady } from './support/appReady';

export const ADMIN_STORAGE_STATE = path.resolve(
  process.cwd(),
  process.env.E2E_AUTH_STATE_OUTPUT || 'playwright/.auth/admin.json',
);

/**
 * Sign in through the TOKEN ENDPOINT, not the login form.
 *
 * WHY. This setup gates every admin spec in `Critical paths`, a required check,
 * so when it fails the check fails for the whole PR. Measured 2026-10-17 it
 * failed on SEVENTEEN open PRs at once with `auth HTTP no response`, while the
 * same endpoint answered 3/3 HTTP 200 in under 200ms from outside CI in the
 * same minute. The cause is contention — ~26 PRs signing in as one admin
 * account against an intermittently saturated instance — and the form flow is
 * the most expensive possible way to ask: boot the SPA, render /auth, fill two
 * inputs, submit, wait for a client-side redirect. Every one of those steps is
 * a chance to stall, and together they put far more load on the instance that
 * is already the bottleneck.
 *
 * A direct grant is ONE request. It is also what the repo already does to get
 * an admin session outside the browser, so this is not a new mechanism.
 *
 * WHAT THIS GIVES UP, stated rather than hidden: the form is no longer
 * exercised here. That is deliberate — this is a fixture, not a test of the
 * login UI, and `e2e/auth-*.spec.ts` covers the form as a user path. If the
 * sign-in FORM breaks, those specs fail; if AUTH breaks, this does.
 */

/** The anon key the app itself ships, read from its single source of truth. */
function anonKey(): string {
  // Same override the app build honours, so a build pointed elsewhere logs in there too.
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  const src = readFileSync(path.join(process.cwd(), 'src/integrations/supabase/client.ts'), 'utf8');
  // The default literal, matched by its JWT shape rather than by how the line is laid out.
  const m = src.match(/["'](eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)["']/);
  if (!m) throw new Error('Could not read the anon key from src/integrations/supabase/client.ts');
  return m[1];
}
function supabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const src = readFileSync(path.join(process.cwd(), 'src/integrations/supabase/client.ts'), 'utf8');
  const m = src.match(/["'](https:\/\/[a-z0-9]+\.supabase\.co)["']/);
  if (!m)
    throw new Error('Could not read the Supabase URL from src/integrations/supabase/client.ts');
  return m[1];
}

/**
 * HTTP statuses that are a VERDICT about this account rather than a failure to
 * ask. Retrying these re-asks an answered question: it burns the suite budget,
 * triples the time to a clear error, and buries the cause. 400 is a rejected
 * credential, 403 a blocked/unconfirmed one, 422 a malformed request.
 */
const TERMINAL_STATUS = new Set([400, 403, 422]);

setup('authenticate as admin', async ({ page, request }) => {
  setup.setTimeout(150_000);
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    setup.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set — admin specs will skip.');
    return;
  }

  const url = supabaseUrl();
  const key = anonKey();
  const ATTEMPTS = 3;
  let session: Record<string, unknown> | undefined;
  let lastWhy: string;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let status: number | undefined;
    try {
      const res = await request.post(`${url}/auth/v1/token?grant_type=password`, {
        headers: { apikey: key, 'Content-Type': 'application/json' },
        data: { email, password },
        timeout: 20_000,
      });
      status = res.status();
      if (res.ok()) {
        const body = (await res.json()) as { expires_in?: number };
        // supabase-js reads `expires_at` (absolute, seconds) off the stored
        // session; the token endpoint returns only `expires_in`.
        session = {
          ...body,
          expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
        };
        break;
      }
      lastWhy = `auth HTTP ${status}`;
    } catch (err) {
      // No response at all — the exact shape that took out seventeen PRs.
      lastWhy = `auth request did not complete (${(err as Error).message.split('\n')[0]})`;
    }

    const terminal = status !== undefined && TERMINAL_STATUS.has(status);
    if (terminal || attempt === ATTEMPTS) {
      // Never log entered values, response payloads or session data.
      throw new Error(
        `Admin sign-in failed after ${attempt} attempt(s): ${lastWhy}` +
          `${terminal ? ' (terminal — not retried)' : ''}.`,
      );
    }
    // Back off: the failure mode is contention, so an immediate retry samples
    // the same bad moment.
    await new Promise((r) => setTimeout(r, 5_000 * attempt));
  }

  // Seed the session before any app code runs, so the SPA boots signed in
  // rather than rendering /auth and redirecting.
  const ref = new URL(url).hostname.split('.')[0];
  await page.addInitScript(
    ([k, v]) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* storage unavailable — the assertion below will catch it */
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session)],
  );

  // POSITIVE CONTROL, and it is the whole safety net for injecting a session
  // rather than typing a password: it proves the token really is an ADMIN one
  // and that the app accepted the stored shape. An anonymous visit to /admin
  // lands on /auth, so this fails loudly if either is wrong.
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  expect(
    new URL(page.url()).pathname.startsWith('/admin'),
    'Injected session did not open /admin — the token is not an admin session, ' +
      'or supabase-js no longer reads this storage key/shape.',
  ).toBe(true);

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
