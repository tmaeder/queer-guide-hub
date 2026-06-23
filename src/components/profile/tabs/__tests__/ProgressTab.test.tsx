/**
 * @vitest-environment jsdom
 *
 * Regression guard for the `/me/progress` blank-screen bug. The fix is
 * structural: every section in ProgressTab is wrapped in an
 * OptimizedErrorBoundary (`Guarded`) so one throwing gamification section
 * degrades to a card instead of blanking the whole tab/route. This test locks
 * that contract — if a future refactor drops a `Guarded`, the isolation test
 * fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const ctrl = vi.hoisted(() => ({ missionsThrows: false }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useCommunityScore', () => ({
  useCommunityScore: () => ({ data: null, loading: false }),
}));

// Stub the heavy section components so their data-hook graphs don't load. One
// (MissionsRow, in the default Score panel) can be made to throw to exercise the
// per-section error boundary.
vi.mock('@/components/profile/MissionsRow', () => ({
  MissionsRow: () => {
    if (ctrl.missionsThrows) throw new Error('boom in missions');
    return <div>missions</div>;
  },
}));
vi.mock('@/components/venues/VenuesPersonalStrip', () => ({
  VenuesPersonalStrip: () => <div>venues-strip</div>,
}));
vi.mock('@/components/profile/progress/StreaksPanel', () => ({
  StreaksPanel: () => <div>streaks</div>,
}));
vi.mock('@/components/profile/progress/LocalSupporterBlock', () => ({
  LocalSupporterBlock: () => <div>local-supporter</div>,
}));
vi.mock('@/components/profile/progress/VisitedVenuesList', () => ({
  VisitedVenuesList: () => <div>visited</div>,
}));
vi.mock('@/components/profile/progress/LeaderboardPanel', () => ({
  LeaderboardPanel: () => <div>leaderboard</div>,
}));
vi.mock('@/components/profile/progress/AchievementsGrid', () => ({
  AchievementsGrid: () => <div>achievements</div>,
}));
vi.mock('@/components/profile/progress/TrustTierLadder', () => ({
  TrustTierLadder: () => <div>trust-tier</div>,
}));

import { ProgressTab } from '../ProgressTab';

describe('ProgressTab', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ctrl.missionsThrows = false;
    // The error boundary (and React, in dev) log to console.error when they
    // catch the intentional throw below — keep test output clean.
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it('renders the segmented sub-tabs and the owner-only footer', () => {
    render(
      <MemoryRouter>
        <ProgressTab />
      </MemoryRouter>,
    );
    expect(screen.getByRole('tab', { name: 'Score' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Recognition' })).toBeTruthy();
    expect(screen.getByText('Visible only to you.')).toBeTruthy();
  });

  it('isolates a thrown section to a card instead of blanking the tab', () => {
    ctrl.missionsThrows = true;
    render(
      <MemoryRouter>
        <ProgressTab />
      </MemoryRouter>,
    );
    // The throwing section degrades to the DataErrorFallback card…
    expect(screen.getByText('Failed to load data')).toBeTruthy();
    // …while the rest of the tab shell still renders (no whole-tab blank).
    expect(screen.getByText('Visible only to you.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Score' })).toBeTruthy();
  });
});
