import { test, expect, type Page } from '@playwright/test';

/**
 * Signed-out coverage for /community/members.
 *
 * This route was the live exposure: `useUserDirectoryQuery` issued `select('*')` against
 * `profiles`, whose RLS filters rows only, so an anonymous visitor received all 173
 * columns — email, date_of_birth, kink_interests, sexual_orientation — of every
 * public-visibility profile. Fixed by a column-level SELECT grant
 * (supabase/migrations/20260816090000_profiles_anon_column_grants.sql) plus an explicit
 * select list in the hook.
 *
 * This spec is load-bearing, not belt-and-braces. `npm run typecheck` and `npm test`
 * cannot see the regression at all: `supabase gen types` introspects pg_attribute
 * regardless of grantee so types.ts keeps all 173 columns, and every vitest spec mocks the
 * Supabase client wholesale. A revert would ship green.
 *
 * There was no signed-out spec for this route before, which is part of why the leak
 * survived: the default chromium project injects admin storageState when
 * E2E_ADMIN_EMAIL/PASSWORD are set, so every existing spec browses authenticated. Each
 * test below opens its own blank context (same pattern as e2e/kink-checklist.spec.ts).
 */

/**
 * Mirrors ANON_DIRECTORY_COLS in src/hooks/useUserDirectoryQuery.ts. Deliberately
 * duplicated rather than imported — importing the hook would pull in the Supabase browser
 * client. The DB-side half of the same contract is asserted by
 * supabase/migrations/__tests__/profiles_column_grants.sql; this asserts what actually
 * reaches the wire.
 */
const ANON_DIRECTORY_COLS = [
  'avatar_url',
  'bio',
  'created_at',
  'display_name',
  'is_business',
  'last_active_at',
  'location',
  'user_id',
  'user_mode',
  'verified_identity',
  'website',
].sort();

/** Never acceptable in an anonymous response, whatever the select list says. */
const MUST_NEVER_APPEAR = [
  'email',
  'phone',
  'date_of_birth',
  'gender_identity',
  'sexual_orientation',
  'kink_interests',
  'kink_experience_level',
  'bdsm_role',
  'sexual_health_status',
  'coming_out_status',
  'emergency_contact_phone',
  'income_range',
  'immigration_status',
  'moderation_status',
  'privacy_settings',
  'discovery_profile',
  'dating_profile',
  'travel_preferences',
  'mailbox_address',
  'identity_details',
];

interface Capture {
  rows: Record<string, unknown>[];
  statuses: number[];
  /**
   * Await every in-flight body parse. Playwright does NOT await an async
   * `page.on('response')` handler, so without this the assertions run while `rows` is
   * still empty — and an empty key set satisfies every "sensitive column absent" check.
   * This spec silently passed against a production build serving all 173 columns
   * (`select=*`, email included) until the settle step was added.
   */
  settle: () => Promise<void>;
}

/** Record every PostgREST read of `profiles` the page makes. */
function captureProfileReads(page: Page): Capture {
  const rows: Record<string, unknown>[] = [];
  const statuses: number[] = [];
  const pending: Promise<void>[] = [];

  page.on('response', (res) => {
    if (!/\/rest\/v1\/profiles/.test(res.url())) return;
    statuses.push(res.status());
    if (res.status() !== 200) return;
    pending.push(
      res
        .json()
        .then((body) => {
          if (Array.isArray(body)) rows.push(...body);
        })
        .catch(() => {
          /* non-JSON body — the status assertion already covers it */
        }),
    );
  });

  return {
    rows,
    statuses,
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

test.describe('members directory — signed out', () => {
  test('serves member cards without leaking a single sensitive column', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const capture = captureProfileReads(page);

    await page.goto('/community/members');
    await expect(page.getByRole('heading', { name: /members/i }).first()).toBeVisible();
    // The anon upsell card is the tell that we are genuinely signed out.
    await expect(page.getByText(/see the full community/i)).toBeVisible();

    await expect
      .poll(() => capture.statuses.length, { message: 'no /rest/v1/profiles request was made' })
      .toBeGreaterThan(0);

    // A 403 would mean the grant is too narrow for what the hook selects — the directory
    // would silently render "No members found" rather than erroring visibly.
    expect(capture.statuses.every((s) => s === 200), `statuses: ${capture.statuses}`).toBe(true);

    await capture.settle();

    // Never assert over an empty sample: zero rows makes every check below vacuous.
    // If the public corpus is genuinely empty this spec has nothing to protect and should
    // fail loudly rather than report a green it did not earn.
    expect(capture.rows.length, 'no profile rows captured — assertions would be vacuous').toBeGreaterThan(0);
    await expect(page.getByText(/no members found/i)).toHaveCount(0);

    const keys = new Set(capture.rows.flatMap((r) => Object.keys(r)));

    for (const forbidden of MUST_NEVER_APPEAR) {
      expect(keys.has(forbidden), `anon received profiles.${forbidden}`).toBe(false);
    }

    // Exact equality, not containment: catches a widened select list as well as a leak.
    expect([...keys].sort()).toEqual(ANON_DIRECTORY_COLS);

    await ctx.close();
  });

  test('search still works signed out (the bio/location grant)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const capture = captureProfileReads(page);

    await page.goto('/community/members');
    await expect(page.getByRole('heading', { name: /members/i }).first()).toBeVisible();

    // `bio` and `location` are granted to anon solely to back this `.or(... ilike ...)`.
    // Drop them from the allowlist and this request 403s while the UI shows an empty list.
    const before = capture.statuses.length;
    await page.getByLabel(/search members/i).fill('a');
    await expect.poll(() => capture.statuses.length).toBeGreaterThan(before);
    expect(capture.statuses.every((s) => s === 200), `statuses: ${capture.statuses}`).toBe(true);

    await ctx.close();
  });

  test('sorting still works signed out (created_at / display_name / last_active_at)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const capture = captureProfileReads(page);

    await page.goto('/community/members');
    await expect(page.getByRole('heading', { name: /members/i }).first()).toBeVisible();
    await expect.poll(() => capture.statuses.length).toBeGreaterThan(0);

    // The sort select sits outside the `isAuthed` gate, so ORDER BY on these three columns
    // is anon-reachable — and ORDER BY needs column privilege just like a projection does.
    // Located by its rendered value ("Newest members" is the default) rather than by
    // position: the page chrome contains other comboboxes, and .first() picked one of them.
    const sort = page
      .getByRole('combobox')
      .filter({ hasText: /newest members|oldest members|alphabetical|last active|best match/i })
      .first();
    await expect(sort, 'the sort control should be visible to signed-out visitors').toBeVisible();

    for (const option of [/^alphabetical$/i, /^last active$/i, /^oldest members$/i]) {
      const before = capture.statuses.length;
      await sort.click();
      await page.getByRole('option', { name: option }).click();
      await expect.poll(() => capture.statuses.length).toBeGreaterThan(before);
    }
    expect(capture.statuses.every((s) => s === 200), `statuses: ${capture.statuses}`).toBe(true);

    await ctx.close();
  });
});
