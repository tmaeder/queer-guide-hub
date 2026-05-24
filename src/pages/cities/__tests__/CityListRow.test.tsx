/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { CityListRow } from '../CityListRow';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

const berlin: DirectoryCity = {
  id: 'berlin',
  slug: 'berlin',
  name: 'Berlin',
  population: 3_700_000,
  image_url: 'https://example.com/berlin.jpg',
  latitude: 52.5,
  longitude: 13.4,
  countries: {
    id: 'de',
    name: 'Germany',
    slug: 'germany',
    equality_score: 75,
    continents: { code: 'EU', name: 'Europe' },
  },
};

function renderRow(props: Partial<React.ComponentProps<typeof CityListRow>> = {}) {
  return renderWithProviders(
    <ul>
      <CityListRow city={berlin} venueCount={142} {...props} />
    </ul>,
  );
}

describe('CityListRow', () => {
  it('renders city name, country, continent code, and venue count', () => {
    renderRow();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Germany · EU')).toBeInTheDocument();
    expect(screen.getByText('142 venues')).toBeInTheDocument();
  });

  it('renders the equality chip', () => {
    renderRow();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('omits the venue count when undefined', () => {
    renderRow({ venueCount: undefined });
    expect(screen.queryByText(/venues/)).not.toBeInTheDocument();
  });

  it('formats large venue counts with a k suffix', () => {
    renderRow({ venueCount: 1450 });
    expect(screen.getByText('1.5k venues')).toBeInTheDocument();
  });

  it('renders the initial letter when no thumbnail is available', () => {
    renderWithProviders(
      <ul>
        <CityListRow
          city={{ ...berlin, image_url: null, curated_image_url: null }}
          venueCount={undefined}
        />
      </ul>,
    );
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('emits onHover with the city id on mouseenter and null on leave', () => {
    const onHover = vi.fn();
    renderRow({ onHover });
    const link = screen.getByText('Berlin').closest('a');
    if (!link) throw new Error('expected link');
    fireEvent.mouseEnter(link);
    expect(onHover).toHaveBeenLastCalledWith('berlin');
    fireEvent.mouseLeave(link);
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it('applies selected styles when selected=true', () => {
    const { container } = renderRow({ selected: true });
    const li = container.querySelector('li');
    expect(li?.className).toMatch(/bg-muted/);
    expect(li?.className).toMatch(/ring-1/);
  });

  it('matches selected by slug as well as id', () => {
    // selected via slug
    const { container } = renderWithProviders(
      <ul>
        <CityListRow city={berlin} venueCount={undefined} selected={true} />
      </ul>,
    );
    expect(container.querySelector('li')?.className).toMatch(/bg-muted/);
  });

  it('links to the city detail page', () => {
    renderRow();
    const link = screen.getByText('Berlin').closest('a');
    expect(link).toHaveAttribute('href', expect.stringContaining('/city/berlin'));
  });

  it('thumbnail is lazy + auto-priority by default', () => {
    const { container } = renderRow();
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('fetchpriority', 'auto');
  });

  it('thumbnail is eager + high-priority when highPriorityImage=true', () => {
    const { container } = renderRow({ highPriorityImage: true });
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });
});
