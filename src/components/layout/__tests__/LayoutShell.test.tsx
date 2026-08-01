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
vi.mock('@/components/analytics/AnalyticsTracker', () => ({
  AnalyticsTracker: () => <span data-testid="analytics" />,
}));

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

  it('keeps analytics mounted on admin — gating it would silently drop pageviews', () => {
    renderAt('/admin');
    expect(screen.getByTestId('analytics')).toBeTruthy();
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
