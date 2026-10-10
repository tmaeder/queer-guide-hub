// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CityDistricts, CityEventsTab, CityVenuesTab } from '../CityVenuesTab.parts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (
      _key: string,
      fallback: string | { defaultValue: string },
      values?: Record<string, string | number>,
    ) =>
      typeof fallback === 'object'
        ? fallback.defaultValue
        : fallback.replace(/{{(\w+)}}/g, (_, name) => String(values?.[name] ?? '')),
  }),
}));
vi.mock('@/components/ui/Image', () => ({
  Image: ({ alt, src }: { alt: string; src?: string }) => (
    <span role="img" aria-label={alt} data-source={src || 'station-placeholder'} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('city galleries and filters', () => {
  it('combines venue name search with category filtering and recovers from no matches', () => {
    wrap(
      <CityVenuesTab
        venues={[
          { id: '1', name: 'Rainbow Café', slug: 'rainbow', category: 'cafe' },
          { id: '2', name: 'Rainbow Bar', slug: 'bar', category: 'bar' },
          { id: '3', name: 'Another Bar', slug: 'another', category: 'bar' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bar', exact: true }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search places' }), {
      target: { value: 'Rainbow' },
    });
    expect(screen.getByRole('link', { name: /Rainbow Bar/ })).toHaveAttribute(
      'href',
      '/venues/bar',
    );
    expect(screen.queryByRole('link', { name: /Rainbow Café/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Another/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no such stop' } });
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'All places' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('can discover places beyond the first six tiles', () => {
    wrap(
      <CityVenuesTab
        venues={Array.from({ length: 14 }, (_, i) => ({
          id: String(i),
          name: `Place ${i}`,
          slug: `place-${i}`,
          category: 'bar',
        }))}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'More places' }));
    expect(screen.getAllByRole('link')).toHaveLength(12);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Place 13' } });
    expect(screen.getByRole('link', { name: /Place 13/ })).toBeInTheDocument();
  });
  it('groups departures by type, sorts within each group, and combines type and free filters', () => {
    wrap(
      <CityEventsTab
        locale="en"
        openLabel="Open"
        events={[
          {
            id: 'late',
            title: 'Late party',
            slug: 'late',
            event_type: 'party',
            start_date: '2099-11-10',
            is_free: false,
          },
          {
            id: 'drag',
            title: 'Drag show',
            slug: 'drag',
            event_type: 'drag',
            start_date: '2099-10-10',
            is_free: true,
          },
          {
            id: 'early',
            title: 'Early party',
            slug: 'early',
            event_type: 'party',
            start_date: '2099-10-09',
            is_free: true,
          },
        ]}
      />,
    );
    const party = screen.getByRole('region', { name: 'Party' });
    expect(
      within(party)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['Early party', 'Late party']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Event type' }), {
      target: { value: 'party' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Free only' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Early party' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'When' }), {
      target: { value: 'today' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
  it('labels ongoing events by their end date rather than presenting a historical start as a departure', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    wrap(
      <CityEventsTab
        locale="en"
        openLabel="Open"
        events={[
          {
            id: 'ongoing',
            title: 'Festival',
            slug: 'festival',
            event_type: 'festival',
            start_date: '2022-01-01',
            end_date: '2026-10-12',
          },
        ]}
      />,
    );
    expect(screen.getByText(/Until/)).toHaveTextContent('OCT 12');
    expect(screen.queryByText(/2022/)).not.toBeInTheDocument();
  });

  it('keeps other event types discoverable when one type dominates the earliest dates', () => {
    const parties = Array.from({ length: 18 }, (_, i) => ({
      id: `party-${i}`,
      title: `Party ${i}`,
      slug: `party-${i}`,
      event_type: 'party',
      start_date: '2099-01-01',
    }));
    wrap(
      <CityEventsTab
        locale="en"
        openLabel="Open"
        events={[
          ...parties,
          {
            id: 'drag',
            title: 'Drag show',
            slug: 'drag',
            event_type: 'drag',
            start_date: '2099-03-01',
          },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Drag' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Party' })).getAllByRole('link')).toHaveLength(
      3,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More departures: Party' }));
    expect(screen.getByRole('combobox', { name: 'Event type' })).toHaveValue('party');
    expect(screen.getAllByRole('link')).toHaveLength(12);
  });

  it('shows district photos, descriptions and a placeholder without inventing imagery', () => {
    wrap(
      <CityDistricts
        villages={[
          {
            id: '1',
            name: 'Schöneberg',
            slug: 'schoneberg',
            image_url: 'https://example.com/photo.jpg',
            description: 'Local community.',
          },
          { id: '2', name: 'Kreuzberg', slug: 'kreuzberg', image_url: null },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Schöneberg' })).toHaveAttribute(
      'data-source',
      'https://example.com/photo.jpg',
    );
    expect(screen.getByRole('img', { name: 'Kreuzberg' })).toHaveAttribute(
      'data-source',
      'station-placeholder',
    );
    expect(screen.getByText('Local community.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Schöneberg/ })).toHaveAttribute(
      'href',
      '/villages/schoneberg',
    );
  });
});
