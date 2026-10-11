import { test, expect, type Page } from '@playwright/test';

// The hub nav must be the SAME control on every /hub route.
//
// It was not. `HubNav` took `activeModule`, `showIdentity`, `showUnread` and
// `unreadCount`, and HubShell was the only caller that passed any of them — so
// the identity block and the Messages unread badge appeared on Overview, Feed,
// Messages, Plans and Saved, and silently vanished on the other twelve routes.
// The bar jumped horizontally as you moved between two hub tabs. Placement
// drifted the same way: inside the page's own PageContainer on GroupDetail,
// GroupInviteAccept, PeopleMode and Cruising; as a sibling on Community; inside
// the hero container on /hub/people. Four vertical offsets for one control.
// Fixed 2026-10-10 (#4277): HubNav takes nothing but `className`, HubNavBar owns
// placement.
//
// src/components/hub/__tests__/hubNavConsistency.test.ts guards the same change,
// but it is a SOURCE SCAN — it proves the bar is rendered and not configured
// away, not that it reaches a browser looking the same. This spec is the other
// half, and it runs against whatever `E2E_BASE_URL` points at (prod by default).
//
// Anonymous on purpose: it is the role most of the hub's traffic arrives as, and
// it is what makes this runnable with no credentials. The cost is that the two
// signed-in affordances — the avatar block and the unread badge — are NOT
// covered here. `HubIdentityBlock` returns null when signed out, which is why
// the bar legitimately starts flush left below. Those are covered by
// HubPage.test.tsx, not by this file.

/** Registry order. Deliberately duplicated from src/config/hubModules.ts: a
 *  guard that imports the thing it guards passes when both move together. */
const GROUPS = ['HOME', 'COMMUNITY', 'CONNECT', 'PERSONAL'] as const;
const PILLS = [
  'Overview',
  'Feed',
  'Members',
  'Friends',
  'Groups',
  'People',
  'Dating',
  'Travel buddies',
  'Nearby',
  'Messages',
  'Plans',
  'Saved',
] as const;

/** One route per page component behind /hub, so every shell that renders the bar
 *  is exercised. `/hub/dating` is absent on purpose: Cruising redirects an
 *  anonymous visitor to /auth before any nav renders, which predates #4277. */
const ROUTES: ReadonlyArray<{ path: string; active: string; shell: string }> = [
  { path: '/hub', active: 'Overview', shell: 'HubShell' },
  { path: '/hub/feed', active: 'Feed', shell: 'HubShell (public)' },
  { path: '/hub/members', active: 'Members', shell: 'Community' },
  { path: '/hub/groups', active: 'Groups', shell: 'Community' },
  { path: '/hub/people', active: 'People', shell: 'IntentPageLayout' },
  { path: '/hub/nearby', active: 'Nearby', shell: 'PeopleMode' },
  { path: '/hub/saved', active: 'Saved', shell: 'HubShell + AuthGate' },
];

/** The bar, located structurally rather than by aria-label — the label comes
 *  from i18n and a locale edit must not silently empty this suite. */
const NAV = 'nav:has(a[href$="/hub/dating"])';

async function openHub(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const nav = page.locator(NAV).first();
  await expect(nav, `${path}: the hub nav never rendered`).toBeVisible({ timeout: 20_000 });
  return nav;
}

test.describe('hub nav', () => {
  test('the route list covers more than one shell', () => {
    // Positive control. Every test below loops over ROUTES, so an empty or
    // single-shell list would turn this file green while checking almost
    // nothing — the vacuous-sweep failure this repo keeps re-learning.
    expect(ROUTES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ROUTES.map((r) => r.shell)).size).toBeGreaterThanOrEqual(4);
    expect(PILLS.length).toBe(12);
  });

  for (const route of ROUTES) {
    test(`${route.path} (${route.shell}) carries the whole bar`, async ({ page }) => {
      const nav = await openHub(page, route.path);

      // Same groups, same order, on every route.
      const groups = (await nav.locator('p').allTextContents()).map((s) => s.trim().toUpperCase());
      expect(groups, `${route.path}: group labels`).toEqual([...GROUPS]);

      // Same twelve destinations, same order. This is what "configured away"
      // would look like: a page rendering a subset.
      const pills = (await nav.locator('a').allTextContents()).map((s) => s.trim());
      expect(pills, `${route.path}: pills`).toEqual([...PILLS]);

      // Exactly one highlighted pill, and it agrees with the URL. Before #4277
      // HubShell drove this from a prop, so the nav could claim an active module
      // the address bar disagreed with.
      const current = await nav.locator('a[aria-current="page"]').allTextContents();
      expect(
        current.map((s) => s.trim()),
        `${route.path}: active pill`,
      ).toEqual([route.active]);
    });
  }

  test('the bar sits at the same left edge on every route', async ({ page }) => {
    // The horizontal jump was the most visible half of the defect: HubShell
    // rendered the identity block and the others did not, so the pills started
    // at a different x depending on which tab you were on.
    const lefts: Record<string, number> = {};
    for (const route of ROUTES) {
      const nav = await openHub(page, route.path);
      const box = await nav.locator('a').first().boundingBox();
      expect(box, `${route.path}: first pill has no box`).not.toBeNull();
      lefts[route.path] = Math.round(box!.x);
    }
    const distinct = new Set(Object.values(lefts));
    expect(distinct.size, `pill left edges differ across routes: ${JSON.stringify(lefts)}`).toBe(1);
  });
});
