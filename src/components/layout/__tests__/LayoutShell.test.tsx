/**
 * @vitest-environment jsdom
 *
 * LayoutShell had no test at all, which is how /admin/* ended up rendering the
 * entire public app on top of AdminShell — sticky Header, public BreadcrumbBar,
 * Footer, and the floating MobileBottomNav covering the bottom of every admin
 * page. These assertions pin the split in both directions: the public routes
 * must keep their chrome, and the console must have none of it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useConversationPresence', () => ({ useGlobalPresence: () => {} }));
vi.mock('@/components/layout/Header', () => ({
  Header: () => <header data-testid="public-header">header</header>,
}));
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="public-footer">footer</footer>,
}));
vi.mock('@/components/layout/MobileBottomNav', () => ({
  MobileBottomNav: () => <nav data-testid="bottom-nav">bottom nav</nav>,
}));
vi.mock('@/components/breadcrumbs/BreadcrumbBar', () => ({
  BreadcrumbBar: () => <div data-testid="public-breadcrumbs" />,
}));
vi.mock('@/components/trips/TripContextBar', () => ({ TripContextBar: () => null }));
vi.mock('@/components/auth/EmailVerifyBanner', () => ({ EmailVerifyBanner: () => null }));

import { LayoutShell } from '@/components/layout/LayoutShell';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LayoutShell>
        <div>route content</div>
      </LayoutShell>
    </MemoryRouter>,
  );
}

const PUBLIC_CHROME = ['public-header', 'public-footer', 'bottom-nav', 'public-breadcrumbs'];

describe('LayoutShell', () => {
  it('renders the public chrome on a public route', () => {
    renderAt('/events');
    for (const id of PUBLIC_CHROME) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toBeTruthy();
  });

  it.each(['/admin', '/admin/inbox', '/admin/content/venues'])(
    'renders no public chrome on %s',
    (path) => {
      renderAt(path);
      for (const id of PUBLIC_CHROME) expect(screen.queryByTestId(id)).toBeNull();
      // AdminShell owns the skip link inside the console.
      expect(screen.queryByRole('link', { name: /skip to main content/i })).toBeNull();
      expect(screen.getByText('route content')).toBeTruthy();
    },
  );

  // This asserted the opposite until /help was returned to the ordinary page
  // shell. The crisis route used to drop the header, footer, breadcrumbs and
  // bottom nav (#4062) on the reasoning that a visitor in distress should not
  // have to filter navigation — which also left the one page someone is most
  // likely to land on cold as the one page with no route back to anything.
  // The safety affordances never depended on the chrome being absent: the
  // emergency numbers live in CrisisBar and Hide screen / Quick exit sit in
  // the content column beneath it. The locale-prefixed variants stay in the
  // list because the old gate was locale-aware, so a half-restoration that
  // only covered bare `/help` would otherwise read as green.
  it.each(['/help', '/help/ch', '/de/help', '/de/help/ch'])(
    'renders the full public chrome on the crisis-support route %s',
    (path) => {
      renderAt(path);
      for (const id of PUBLIC_CHROME) expect(screen.getByTestId(id)).toBeTruthy();
      expect(screen.getByRole('link', { name: /skip to main content/i })).toBeTruthy();
      expect(screen.getByText('route content')).toBeTruthy();
    },
  );

  // This used to assert the opposite — "keeps analytics mounted on admin,
  // gating it would silently drop pageviews" — which encoded the consent
  // bypass as the intended behaviour. The tracker it mounted reached the
  // ingest edge function directly, past analyticsLoader's consent gate, and
  // carried 98.9% of all tracking (prod, 2026-09-12). Page views now come from
  // public/umami.js alone, which is injected only after explicit consent.
  it('mounts no page-view tracker of its own, on admin or anywhere else', () => {
    for (const path of ['/admin', '/', '/travel']) {
      const { unmount } = renderAt(path);
      // Positive control: the tree really did render, so a null tracker is an
      // absence and not an empty render.
      expect(screen.getByText('route content')).toBeTruthy();
      expect(screen.queryByTestId('analytics')).toBeNull();
      unmount();
    }
  });

  it('does not treat a route merely prefixed with /admin as the console', () => {
    renderAt('/administrators');
    expect(screen.getByTestId('public-header')).toBeTruthy();
  });

  it('still hides only the footer and breadcrumbs on the full-bleed map', () => {
    renderAt('/map');
    expect(screen.getByTestId('public-header')).toBeTruthy();
    expect(screen.getByTestId('bottom-nav')).toBeTruthy();
    expect(screen.queryByTestId('public-footer')).toBeNull();
    expect(screen.queryByTestId('public-breadcrumbs')).toBeNull();
  });
});
