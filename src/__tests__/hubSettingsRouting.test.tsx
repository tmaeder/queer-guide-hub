/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}));
vi.mock('@/providers/SearchTelemetryProvider', () => ({ useSearchTelemetry: () => {} }));
vi.mock('@/components/security/AdminRouteGuard', () => ({
  AdminRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/RouteFade', () => ({
  RouteFade: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/pages/profile/ProfilePage', () => ({ default: () => <div>PROFILE</div> }));
vi.mock('@/pages/Settings', () => ({ default: () => <div>SETTINGS</div> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div>NOT_FOUND</div> }));

import { AppRoutes } from '@/routes';

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return (
    <output data-testid="location">
      {pathname}
      {search}
      {hash}
    </output>
  );
}

describe('hub settings routing', () => {
  it.each([
    ['/hub/settings', '/settings/profile'],
    ['/de/hub/settings', '/de/settings/profile'],
    ['/de/me/settings?tab=dating', '/de/settings/dating'],
    ['/profile/settings?tab=identity', '/settings/identity'],
    ['/ar/profile/settings?section=account', '/ar/settings/security'],
    ['/de/me/settings?section=travel', '/de/settings/travel'],
    ['/me/settings?section=privacy#visibility', '/settings/privacy#visibility'],
    ['/me/account', '/settings/security'],
  ])('resolves %s to %s', async (source, target) => {
    render(
      <MemoryRouter initialEntries={[source]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(await screen.findByText('SETTINGS')).toBeTruthy();
    expect(screen.getByTestId('location')).toHaveTextContent(target);
    expect(screen.queryByText('NOT_FOUND')).toBeNull();
  });

  it('keeps the inline avatar editor on the profile', async () => {
    render(
      <MemoryRouter initialEntries={['/me/settings?section=avatar']}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(await screen.findByText('PROFILE')).toBeTruthy();
    expect(screen.getByTestId('location')).toHaveTextContent('/user/u1?edit=avatar');
  });

  it.each(['/settings', '/settings/notifications', '/de/settings/privacy'])(
    'serves %s as the settings page',
    async (source) => {
      render(
        <MemoryRouter initialEntries={[source]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>,
      );
      expect(await screen.findByText('SETTINGS')).toBeTruthy();
      expect(screen.getByTestId('location')).toHaveTextContent(source);
    },
  );
});
