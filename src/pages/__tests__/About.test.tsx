/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Mirrors ConsolidatedStats: every field is `number | null`, and the page must
// read `events_upcoming` (actionable) rather than `events` (the 40k archive,
// 99% of it in the past). The two are deliberately different here so a
// regression back to `events` shows up as the wrong number on screen.
vi.mock('@/hooks/useConsolidatedStats', () => ({
  useConsolidatedStats: () => ({
    stats: {
      venues: 21000,
      profiles: null,
      cities: 1800,
      countries: 180,
      events: 40000,
      events_upcoming: 320,
      posts: null,
      personalities: null,
      groups: null,
      tags: null,
      marketplace: null,
      news: null,
      cms: null,
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import About from '../About';

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>,
  );

describe('About', () => {
  it('renders without crashing', () => {
    const { container } = renderAbout();
    expect(container).toBeTruthy();
  });

  it('shows upcoming events, not the full archive', () => {
    renderAbout();
    expect(screen.getByText('320+')).toBeInTheDocument();
    expect(screen.queryByText('40,000+')).not.toBeInTheDocument();
  });

  it('renders one route bullet per line in the line index', () => {
    renderAbout();
    for (const label of ['Venue', 'Event', 'Marketplace', 'Group', 'City']) {
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    }
  });
});
