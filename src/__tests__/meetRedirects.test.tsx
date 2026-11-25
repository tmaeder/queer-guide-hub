/**
 * @vitest-environment jsdom
 *
 * Every old discovery URL (the /hub/* modules and the legacy aliases) must land
 * on its /meet equivalent with params, query and invite tokens intact, under a
 * locale prefix too (docs/plans/2026-11-22-hub-meet-ia-design.md, phase 1).
 */
import { describe, it, expect, vi } from 'vitest';
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
vi.mock('@/components/motion', () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function Landed() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{pathname + search}</div>;
}
vi.mock('@/pages/people/People', () => ({ default: Landed }));
vi.mock('@/pages/people/PeopleMode', () => ({ default: Landed }));
vi.mock('@/pages/people/TravelMeet', () => ({ default: Landed }));
vi.mock('@/pages/Community', () => ({ default: Landed }));
vi.mock('@/pages/Cruising', () => ({ default: Landed }));
vi.mock('@/pages/GroupDetail', () => ({ default: Landed }));
vi.mock('@/pages/profile/ProfilePage', () => ({ default: Landed }));
vi.mock('@/pages/GroupInviteAccept', () => ({ default: Landed }));
vi.mock('@/pages/intimate/IntimateOnboard', () => ({ default: Landed }));
vi.mock('@/pages/intimate/IntimateUserDetail', () => ({ default: Landed }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div data-testid="landed">NOT_FOUND</div> }));

import { AppRoutes } from '@/routes';

async function landsOn(from: string) {
  const { unmount } = render(
    <MemoryRouter initialEntries={[from]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  const text = (await screen.findByTestId('landed')).textContent;
  unmount();
  return text;
}

const REDIRECTS: [string, string][] = [
  ['/hub/people', '/meet'],
  ['/hub/people?city=berlin', '/meet?city=berlin'],
  ['/hub/members', '/meet/members'],
  ['/hub/groups', '/meet/groups'],
  ['/hub/groups/g1', '/meet/groups/g1'],
  ['/hub/groups/invite/tok-123?ref=mail', '/meet/groups/invite/tok-123?ref=mail'],
  ['/hub/dating', '/meet/dating'],
  ['/hub/dating/onboarding', '/meet/dating/onboarding'],
  ['/hub/dating/u1', '/user/u1/dating'],
  ['/hub/travel?tripId=t1', '/meet/travel?tripId=t1'],
  ['/hub/nearby', '/meet/nearby'],
  ['/people', '/meet'],
  ['/directory', '/meet'],
  ['/users', '/meet/members'],
  ['/groups', '/meet/groups'],
  ['/groups/g1', '/meet/groups/g1'],
  ['/groups/invite/tok-123', '/meet/groups/invite/tok-123'],
  ['/my-groups', '/meet/groups?tab=mine'],
  ['/community/groups', '/meet/groups'],
  ['/people/dating/u1', '/user/u1/dating'],
  ['/dating', '/meet/dating'],
  ['/cruising', '/meet/nearby?layers=spots'],
  ['/intimate', '/meet/dating'],
  ['/discover', '/meet/dating'],
  ['/intimate/u/u1', '/user/u1/dating'],
  ['/meet/dating/u1?ref=x', '/user/u1/dating?ref=x'],
];

describe('old discovery URLs redirect to /meet', () => {
  it('lands each one on its /meet equivalent', async () => {
    for (const [from, to] of REDIRECTS) {
      expect(await landsOn(from), from).toBe(to);
    }
  });

  it('keeps the locale prefix', async () => {
    expect(await landsOn('/de/hub/people')).toBe('/de/meet');
    expect(await landsOn('/de/hub/groups/invite/tok-123')).toBe('/de/meet/groups/invite/tok-123');
    expect(await landsOn('/ar/cruising')).toBe('/ar/meet/nearby?layers=spots');
  });

  it('serves the /meet pages themselves, unprefixed and localized', async () => {
    for (const path of ['/meet', '/meet/groups/g1', '/meet/dating/onboarding', '/de/meet/travel']) {
      expect(await landsOn(path), path).toBe(path);
    }
  });
});
