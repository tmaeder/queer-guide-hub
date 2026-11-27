/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
const state = vi.hoisted(() => ({ data: [] as Record<string, unknown>[] }));
vi.mock('@/hooks/useUpcomingPrideEvents', () => ({
  useUpcomingPrideEvents: () => ({ data: state.data, isLoading: false }),
}));
import { PrideScroller } from '../PrideScroller';
describe('PrideScroller', () => {
  it('shows the empty state', () => {
    renderWithProviders(<PrideScroller />);
    expect(screen.getByText('No upcoming Pride events.')).toBeInTheDocument();
  });
  it('uses the event timezone for its badge and date range', () => {
    state.data = [
      {
        id: 'p1',
        slug: 'island-pride',
        title: 'Island Pride',
        start_date: '2027-01-01T23:00:00Z',
        end_date: '2027-01-02T01:00:00Z',
        timezone: 'Pacific/Kiritimati',
        images: null,
        city: null,
        country: null,
      },
    ];
    try {
      const { container } = renderWithProviders(<PrideScroller />);
      expect(screen.getByRole('link', { name: 'Island Pride' })).toHaveAttribute(
        'href',
        '/events/island-pride',
      );
      expect(container.querySelector('time')).toHaveTextContent('Jan 2');
      expect(container.querySelector('time')).not.toHaveTextContent('–');
    } finally {
      state.data = [];
    }
  });
});
