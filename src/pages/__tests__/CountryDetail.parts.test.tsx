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

vi.mock('@/hooks/useMilestones', () => ({
  useMilestonesForCountry: () => ({ data: [] }),
  useMilestonesForCity: () => ({ data: [] }),
}));

import {
  CountryRightsTab,
  CountryCitiesTab,
  CountryLegalRecord,
  countryCityStops,
  countryOccurrences,
  countryVenueStops,
  countryNewsRows,
} from '../CountryDetail.parts';
import type { LegalStation } from '@/lib/rights/legalLine';

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
  const line = (over: Partial<LegalStation> = {}): LegalStation => ({
    id: 'm1',
    year: 2017,
    source: 'milestone',
    section: 'family',
    label: { kind: 'milestone', title: 'Marriage equality' },
    impact: 'positive',
    slug: 'marriage-equality',
    scope: 'country',
    ...over,
  });

  it('renders nothing when the country has no legal record at all', () => {
    const { container } = renderWithProviders(
      <CountryLegalRecord countryName="Germany" stations={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('orders the legal record newest-first, not by significance', () => {
    // `milestones_for_country` ranks by significance; a legal record is
    // chronological or it is not a record. `buildLegalLine` hands over the
    // canonical ascending order, so the reversal is the component's job.
    const { container } = renderWithProviders(
      <CountryLegalRecord
        countryName="Germany"
        stations={[
          line({
            id: 'm3',
            year: 1994,
            label: { kind: 'milestone', title: 'Paragraph 175 repealed' },
          }),
          line({ id: 'm1', year: 2001, label: { kind: 'milestone', title: 'Civil partnerships' } }),
          line({ id: 'm2', year: 2017, label: { kind: 'milestone', title: 'Marriage equality' } }),
        ]}
      />,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('Marriage equality')).toBeLessThan(text.indexOf('Civil partnerships'));
    expect(text.indexOf('Civil partnerships')).toBeLessThan(text.indexOf('Paragraph 175 repealed'));
  });

  it('prints absolute years — a legal record read as "2 months ago" re-reads as fresh forever', () => {
    renderWithProviders(<CountryLegalRecord countryName="Germany" stations={[line()]} />);
    expect(screen.getByText('2017')).toBeInTheDocument();
  });

  it('renders a derived adoption year with no link, since it has no page', () => {
    const { container } = renderWithProviders(
      <CountryLegalRecord
        countryName="Germany"
        stations={[
          line({
            id: 'ilga:family:2017',
            source: 'ilga',
            slug: undefined,
            label: { kind: 'topics', slugs: ['marriage'] },
          }),
        ]}
      />,
    );
    expect(screen.getByText('2017')).toBeInTheDocument();
    expect(container.querySelector('a[href*="/history/"]')).toBeNull();
  });
});

describe('countryVenueStops — venues as compact rows, not cards', () => {
  it('caps at six and links each venue', () => {
    const venues = Array.from({ length: 9 }, (_, i) => ({
      id: `v${i}`,
      name: `Venue ${i}`,
      slug: `venue-${i}`,
      category: 'bar',
      city: 'Berlin',
    }));
    const stops = countryVenueStops(venues as never);
    expect(stops).toHaveLength(6);
    expect(stops[0].href).toBe('/venues/venue-0');
    expect(stops[0].type).toBe('venue');
    expect(stops[0].accessNote).toBe('bar · Berlin');
    // A country's venues are context, not a route — no walking gaps claimed.
    expect(stops[0].walkFromPrevious).toBeNull();
  });

  it('omits the access note when category and city are both missing', () => {
    const stops = countryVenueStops([{ id: 'v1', name: 'X', slug: 'x' }] as never);
    expect(stops[0].accessNote).toBeNull();
  });
});

describe('countryNewsRows — headline rows in the occurrence grammar', () => {
  it('caps at five and dates each headline', () => {
    const articles = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      title: `Headline ${i}`,
      slug: `headline-${i}`,
      published_at: '2026-08-14T10:00:00Z',
    }));
    const rows = countryNewsRows(articles as never, 'en-GB', 'Open');
    expect(rows).toHaveLength(5);
    expect(rows[0].date).toBe('14 AUG');
    expect(rows[0].detail).toBe('Headline 0');
  });

  it('drops the link, not the row, for an article with no slug', () => {
    const rows = countryNewsRows(
      [{ id: 'a1', title: 'No slug', published_at: '2026-08-14' }] as never,
      'en-GB',
      'Open',
    );
    expect(rows[0].action).toBeUndefined();
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
