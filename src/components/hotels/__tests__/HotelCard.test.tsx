/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HotelCard } from '../HotelCard';

describe('HotelCard', () => {
  it('renders loading skeleton', () => {
    const { container } = render(
      <MemoryRouter>
        <HotelCard loading />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders with hotel', () => {
    const hotel = {
      id: 'h',
      name: 'X',
      slug: 'x',
      type: 'hotel',
      city_name: 'Berlin',
      country_name: 'DE',
    } as never;
    const { container } = render(
      <MemoryRouter>
        <HotelCard hotel={hotel} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('draws the hotel-type mark in the plate when there is no photo', () => {
    const hotel = { id: 'h', name: 'X', slug: 'x', hotel_type: 'bnb', images: [] } as never;
    const { container } = render(
      <MemoryRouter>
        <HotelCard hotel={hotel} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
  });

  it('puts the hotel-type mark on a station badge when there is a photo', () => {
    const hotel = {
      id: 'h',
      name: 'X',
      slug: 'x',
      hotel_type: 'bnb',
      images: ['https://example.com/a.jpg'],
    } as never;
    const { container } = render(
      <MemoryRouter>
        <HotelCard hotel={hotel} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="home-base"]')).not.toBeNull();
  });
});
