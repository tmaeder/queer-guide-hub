/**
 * @vitest-environment jsdom
 *
 * Route-honesty guard for the admin console.
 *
 * Three things this locks down, all of which were broken before 2026-07:
 *
 *  1. An unknown /admin/* path rendered AdminShell with an EMPTY content area
 *     (no catch-all child existed), which reads as a broken page rather than a
 *     wrong URL. A `<Route path="*">` now catches it.
 *  2. That catch-all must NOT shadow `content/:type`. React Router ranks `*`
 *     lowest, so it can't — but the whole point of the test is to prove that
 *     against the REAL route tree rather than trusting the ranking rule.
 *  3. /admin/pages duplicated /admin/content/cms_pages, and /admin/vendors was
 *     a strict subset of /admin/affiliate. Both are now redirects; if someone
 *     resurrects them as real pages the duplication is back.
 *
 * Mounts the real AppRoutes (same approach as submitRouting.test.tsx) so the
 * live route tree is what's exercised.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, Outlet } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}));

vi.mock('@/providers/SearchTelemetryProvider', () => ({
  useSearchTelemetry: () => {},
}));

// Bypass auth/role gating — this test is about route resolution, not access.
vi.mock('@/components/security/AdminRouteGuard', () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The real shell pulls in the sidebar, command palette, counts RPC and the CMS
// editor overlay. All we need is the <Outlet /> the child routes render into.
vi.mock('@/components/admin/shell/AdminShell', () => ({
  default: () => <Outlet />,
  AdminShell: () => <Outlet />,
}));

vi.mock('@/components/motion', () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/admin/AdminNotFound', () => ({
  default: () => <div>ADMIN_NOT_FOUND_SENTINEL</div>,
}));

vi.mock('@/components/cms/ContentListPanel', async () => {
  const { useParams } = await import('react-router');
  const Panel = ({ contentTypeId }: { contentTypeId?: string }) => {
    const { type } = useParams<{ type: string }>();
    return <div>CONTENT_LIST_SENTINEL:{contentTypeId ?? type ?? 'NONE'}</div>;
  };
  return { default: Panel, ContentListPanel: Panel };
});

vi.mock('@/pages/admin/AdminAffiliate', () => {
  const AffiliateMock = () => {
    const location = useLocation();
    return <div>AFFILIATE_SENTINEL:{location.search}</div>;
  };
  return { default: AffiliateMock };
});

import { AppRoutes } from '@/routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('admin route resolution', () => {
  it('renders AdminNotFound for an unknown /admin path instead of an empty shell', async () => {
    renderAt('/admin/this-route-does-not-exist');
    expect(await screen.findByText('ADMIN_NOT_FOUND_SENTINEL')).toBeTruthy();
  });

  it('renders AdminNotFound for a deep unknown /admin path', async () => {
    renderAt('/admin/nope/deeper/still');
    expect(await screen.findByText('ADMIN_NOT_FOUND_SENTINEL')).toBeTruthy();
  });

  it('does not let the catch-all shadow content/:type', async () => {
    for (const type of ['venues', 'events', 'countries', 'organizations', 'hotels']) {
      const { unmount } = renderAt(`/admin/content/${type}`);
      expect(
        await screen.findByText(`CONTENT_LIST_SENTINEL:${type}`),
        `/admin/content/${type} must resolve to the content list, not the catch-all`,
      ).toBeTruthy();
      expect(screen.queryByText('ADMIN_NOT_FOUND_SENTINEL')).toBeNull();
      unmount();
    }
  });

  it('redirects the orphaned /admin/pages to the canonical cms_pages list', async () => {
    renderAt('/admin/pages');
    expect(await screen.findByText('CONTENT_LIST_SENTINEL:cms_pages')).toBeTruthy();
  });

  it('redirects /admin/vendors into the affiliate cockpit merchants tab', async () => {
    renderAt('/admin/vendors');
    expect(await screen.findByText('AFFILIATE_SENTINEL:?tab=merchants')).toBeTruthy();
  });
});
