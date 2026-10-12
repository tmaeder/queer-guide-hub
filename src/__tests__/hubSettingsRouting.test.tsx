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
    ['/hub/settings', '/user/u1?edit=profile'],
    ['/de/hub/settings', '/de/user/u1?edit=profile'],
    [
      '/settings?section=privacy#settings-section-privacy',
      '/user/u1?edit=privacy#settings-section-privacy',
    ],
    ['/de/settings?tab=dating', '/de/user/u1?edit=dating'],
    ['/profile/settings?tab=identity', '/user/u1?edit=dating'],
    ['/ar/profile/settings?section=account', '/ar/user/u1/account'],
    ['/me/settings?section=avatar', '/user/u1?edit=avatar'],
    ['/de/me/settings?section=travel', '/de/user/u1/travel?edit=travel'],
    ['/settings/privacy?from=profile', '/user/u1?from=profile&edit=privacy'],
    ['/de/settings/privacy?section=account&tab=dating#privacy', '/de/user/u1?edit=privacy#privacy'],
    ['/me/account', '/user/u1/account'],
  ])('resolves %s to the settings module at %s', async (source, target) => {
    render(
      <MemoryRouter initialEntries={[source]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(await screen.findByText('PROFILE')).toBeTruthy();
    expect(screen.getByTestId('location')).toHaveTextContent(target);
    expect(screen.queryByText('NOT_FOUND')).toBeNull();
  });
});
