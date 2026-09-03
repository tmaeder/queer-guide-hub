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

  // The colophon is the only place several of these are credited at all, and
  // for four of them the credit is a licence condition rather than a courtesy:
  // ODbL (OpenStreetMap, and the two country datasets) and CC BY 4.0
  // (GeoNames) both require attribution. Deleting a row to tidy the section is
  // therefore a licence breach, not a design decision — this is what stops it.
  it('credits every source whose licence requires attribution', () => {
    const { container } = renderAbout();
    const section = container.querySelector('#sources');
    expect(section).toBeTruthy();
    const text = section?.textContent ?? '';
    for (const name of [
      'OpenStreetMap',
      'GeoNames',
      'Countries States Cities Database',
      'mledoze/countries',
    ]) {
      expect(text).toContain(name);
    }
  });

  // A property, not a list: whatever the colophon names, it must actually
  // reach. A credit that renders as bare text credits nobody, and an
  // unattributed `target="_blank"` is a tabnabbing hole. Written this way so a
  // source added later is covered without anyone remembering to extend a test.
  it('makes every credit a safe outbound link', () => {
    const { container } = renderAbout();
    const links = Array.from(container.querySelectorAll('#sources a'));
    expect(links.length).toBeGreaterThan(20);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('renders one route bullet per line in the line index', () => {
    renderAbout();
    for (const label of ['Venue', 'Event', 'Marketplace', 'Group', 'City']) {
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    }
  });
});
