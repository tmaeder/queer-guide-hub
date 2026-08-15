/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '@/test/test-utils';

// The parts barrel pulls in EntityMap → maplibre, whose worker URL vitest
// refuses to resolve. Nothing here exercises the map.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));

const milestones = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/hooks/useMilestones', () => ({
  useMilestonesForCountry: () => ({ data: milestones.data }),
}));

import {
  CountryRightsTab,
  CountryCitiesTab,
  CountryLegalRecord,
  countryCityStops,
  countryOccurrences,
} from '../CountryDetail.parts';

describe('CountryDetail.parts', () => {
  it('CountryRightsTab renders', () => {
    const { container } = render(<CountryRightsTab country={{} as never} />);
    expect(container).toBeTruthy();
  });

  it('CountryCitiesTab renders nothing with no cities', () => {
    // Rule 2 moved the empty-state decision to the page, which drops the
    // whole section rather than printing a placeholder card.
    const { container } = render(
      <MemoryRouter>
        <CountryCitiesTab cities={[] as never} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('city stops are real links, not onClick handlers', () => {
    // The grid this replaced navigated with `window.location.href` inside an
    // onClick: a full reload, no middle-click, invisible to a screen reader's
    // link list.
    const stops = countryCityStops([
      { id: 'c1', name: 'Berlin', slug: 'berlin', region_name: 'Berlin' },
    ] as never);
    expect(stops[0].href).toBe('/city/berlin');
    expect(stops[0].type).toBe('city');
    // Two cities in a country are not a walk.
    expect(stops[0].walkFromPrevious).toBeNull();
  });
});

describe('CountryLegalRecord — module 12, the country single OWNER module', () => {
  it('renders nothing when the country has no dated milestones', () => {
    milestones.data = [];
    const { container } = renderWithProviders(
      <CountryLegalRecord countryId="co1" countryName="Germany" seeAllLabel="Full timeline" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('orders the legal record newest-first, not by significance', () => {
    // `milestones_for_country` ranks by significance; a version history is
    // chronological or it is not a history.
    milestones.data = [
      { id: 'm1', date: '2001-08-01', title: 'Civil partnerships', category: 'legal' },
      { id: 'm2', date: '2017-10-01', title: 'Marriage equality', category: 'legal' },
      { id: 'm3', date: '1994-03-11', title: 'Paragraph 175 repealed', category: 'legal' },
    ];
    const { container } = renderWithProviders(
      <CountryLegalRecord countryId="co1" countryName="Germany" seeAllLabel="Full timeline" />,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Marriage equality')).toBeLessThan(text.indexOf('Civil partnerships'));
    expect(text.indexOf('Civil partnerships')).toBeLessThan(
      text.indexOf('Paragraph 175 repealed'),
    );
  });

  it('prints absolute dates — a legal record read as "2 months ago" re-reads as fresh forever', () => {
    milestones.data = [
      { id: 'm2', date: '2017-10-01', title: 'Marriage equality', category: 'legal' },
    ];
    renderWithProviders(
      <CountryLegalRecord countryId="co1" countryName="Germany" seeAllLabel="Full timeline" />,
    );
    expect(screen.getByText(/2017/)).toBeInTheDocument();
  });
});

describe('countryOccurrences', () => {
  it('names the city an event is in', () => {
    const rows = countryOccurrences(
      [{ id: 'e1', title: 'CSD', start_date: '2026-07-25', city: 'Cologne' }] as never,
      'en-GB',
      'Open',
    );
    expect(rows[0].detail).toBe('CSD · Cologne');
  });
});
