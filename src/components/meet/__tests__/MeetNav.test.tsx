import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, within } from '@/test/test-utils';
import { MeetNav } from '../MeetNav';

const { auth } = vi.hoisted(() => ({ auth: { user: { id: 'me' } as { id: string } | null } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = { id: 'me' };
});

describe('consolidated Meet navigation', () => {
  it('groups travel and nearby under People, preserving explicit trip dates and city', () => {
    renderWithProviders(<MeetNav />, {
      route: '/de/meet/travel?cityId=city-1&tripId=t1&start=2027-01-01&end=2027-01-03&q=private',
    });
    const lists = screen.getAllByRole('list');
    expect(within(lists[0]).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Travel buddies' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const dating = screen.getByRole('link', { name: 'Dating' });
    expect(dating.getAttribute('href')).toBe(
      '/de/meet/dating?cityId=city-1&tripId=t1&start=2027-01-01&end=2027-01-03',
    );
    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute(
      'href',
      '/de/hub/friends',
    );
  });

  it('keeps signed-out dating visibility and the Hub privacy boundary', () => {
    auth.user = null;
    renderWithProviders(<MeetNav />, { route: '/meet' });
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByRole('link', { name: 'Dating' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connections' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
  });
});
