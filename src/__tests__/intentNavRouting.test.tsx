/**
 * @vitest-environment jsdom
 *
 * Route-resolution guard for the Intent Router paths.
 *
 * Same bug class as cmsPageRouting.test.tsx and submitRouting.test.tsx: the
 * locale layout parent is `<Route path="/:locale?">`, and React Router expands
 * the optional segment. Two hazards apply to the intent routes specifically:
 *
 *  1. `/shop` and `shop/*`. Both now redirect to /marketplace — the two pages
 *     were the same surface, so declaration order no longer changes what
 *     renders. The order is preserved and asserted anyway, because this is the
 *     ONLY layer that carries the LOCALIZED case: the public/_redirects 301 is
 *     unprefixed by design and is inert off Cloudflare entirely, so `/de/shop`
 *     has nothing but the router.
 *  2. Locale prefixes. `/de/rights` must render the Rights page, not NotFound —
 *     which is what happens if a route is accidentally declared outside the
 *     locale parent.
 *
 * The 2-letter-slug rule (stripLocale eats any `[a-z]{2}` first segment) is
 * asserted in src/config/__tests__/navigation.test.ts, where the intent list
 * itself lives.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}));

vi.mock('@/providers/SearchTelemetryProvider', () => ({
  useSearchTelemetry: () => {},
}));

vi.mock('@/components/security/AdminRouteGuard', () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/motion', () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/intent/GoingOut', () => ({ default: () => <div>GOING_OUT_SENTINEL</div> }));
vi.mock('@/pages/intent/Rights', () => ({ default: () => <div>RIGHTS_SENTINEL</div> }));
vi.mock('@/pages/rights/RightsSources', () => ({
  default: () => <div>RIGHTS_SOURCES_SENTINEL</div>,
}));
vi.mock('@/pages/HelpHotlines', () => ({ default: () => <div>HELP_SENTINEL</div> }));
vi.mock('@/pages/Travel', () => ({ default: () => <div>TRAVEL_SENTINEL</div> }));
vi.mock('@/pages/Marketplace', () => ({ default: () => <div>MARKETPLACE_SENTINEL</div> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div>NOT_FOUND_SENTINEL</div> }));

import { AppRoutes } from '@/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

async function expectSentinel(path: string, sentinel: string) {
  const { unmount } = renderAt(path);
  expect(await screen.findByText(sentinel), `${path} should render ${sentinel}`).toBeTruthy();
  expect(screen.queryByText('NOT_FOUND_SENTINEL')).toBeNull();
  unmount();
}

const INTENTS: [string, string][] = [
  ['/going-out', 'GOING_OUT_SENTINEL'],
  ['/rights', 'RIGHTS_SENTINEL'],
  // /support is now a redirect: the page was the org-directory slice of /help
  // (same hook, same role filter) and /help is the superset. The URL must keep
  // resolving — it is the Support track's identity and has inbound links — so
  // this asserts it lands on /help rather than 404ing.
  ['/support', 'HELP_SENTINEL'],
  // /shop is now a redirect too, for the same reason: it was /marketplace's
  // twin (two of its three sections were duplicates of blocks the marketplace
  // landing already rendered) and /marketplace is the superset. Listing it here
  // is what asserts `/de/shop` → `/de/marketplace`, which nothing else covers.
  ['/shop', 'MARKETPLACE_SENTINEL'],
  ['/travel', 'TRAVEL_SENTINEL'],
];

/**
 * Children of an intent route. A STATIC second segment scores 24 in React
 * Router's ranking and beats `/:locale/<static>` at 17 unconditionally; a
 * dynamic one (`rights/:right`) ties at 17 and resolves to NotFound for an
 * unknown "locale". These assertions are what stops someone collapsing the
 * list into a param later — the failure would otherwise only show up as a
 * 404 on a locale-prefixed URL nobody tests by hand.
 */
describe('intent route children stay static', () => {
  it('resolves /rights/sources unprefixed and under a locale', async () => {
    await expectSentinel('/rights/sources', 'RIGHTS_SOURCES_SENTINEL');
    await expectSentinel('/en/rights/sources', 'RIGHTS_SOURCES_SENTINEL');
    await expectSentinel('/de/rights/sources', 'RIGHTS_SOURCES_SENTINEL');
    await expectSentinel('/ar/rights/sources', 'RIGHTS_SOURCES_SENTINEL');
  });

  it('404s an unknown rights child rather than swallowing it', async () => {
    // Proves no `rights/*` splat and no `rights/:param` exists. A splat scores
    // 12 and would lose to /:locale/<static>, making resolution inconsistent;
    // a param would tie. Either turns a typo into a soft-404 for crawlers.
    const { unmount } = renderAt('/rights/not-a-real-child');
    expect(await screen.findByText('NOT_FOUND_SENTINEL')).toBeTruthy();
    unmount();
  });
});

describe('intent route resolution', () => {
  it('resolves every intent route unprefixed', async () => {
    for (const [path, sentinel] of INTENTS) {
      await expectSentinel(path, sentinel);
    }
  });

  it('resolves every intent route under a locale prefix', async () => {
    for (const [path, sentinel] of INTENTS) {
      await expectSentinel(`/en${path}`, sentinel);
      await expectSentinel(`/de${path}`, sentinel);
      await expectSentinel(`/ar${path}`, sentinel);
    }
  });

  it('redirects bare /shop to the marketplace, not just /shop/<something>', async () => {
    // `shop` still precedes `shop/*` in routes.tsx so the static sibling wins
    // the tie; both targets are the same now, but a bare /shop falling through
    // to the splat is the shape that would silently drop the locale prefix.
    await expectSentinel('/shop', 'MARKETPLACE_SENTINEL');
  });

  it('still redirects legacy /shop/<anything> to the marketplace', async () => {
    const { unmount } = renderAt('/shop/some-legacy-path');
    expect(await screen.findByText('MARKETPLACE_SENTINEL')).toBeTruthy();
    unmount();
  });

  it('retires /places to the Travelling intent', async () => {
    const { unmount } = renderAt('/places');
    expect(await screen.findByText('TRAVEL_SENTINEL')).toBeTruthy();
    unmount();
  });

  it('keeps the locale prefix when retiring /places', async () => {
    // A bare <Navigate> here would drop the prefix and bounce /de/places to
    // English; LocalizedRedirect is what preserves it.
    const { unmount } = renderAt('/de/places');
    expect(await screen.findByText('TRAVEL_SENTINEL')).toBeTruthy();
    unmount();
  });
});
