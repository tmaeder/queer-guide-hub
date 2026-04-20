import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HotelCard } from '../HotelCard';
import type { Hotel } from '@/hooks/useHotels';
import { expectNoPlaceholderLeaks } from '@/test/assertNoLeaks';

function makeHotel(overrides: Partial<Record<keyof Hotel, unknown>> = {}): Hotel {
  return {
    id: 'h-1',
    slug: 'sample-hotel',
    name: 'Sample Hotel',
    images: null,
    city: null,
    country: null,
    hotel_type: null,
    price_range: null,
    star_rating: null,
    lgbtq_friendly: null,
    featured: null,
    ...overrides,
  } as unknown as Hotel;
}

function renderCard(hotel: Hotel) {
  return render(
    <MemoryRouter>
      <HotelCard hotel={hotel} />
    </MemoryRouter>,
  );
}

describe('HotelCard — placeholder-leak guard', () => {
  it('renders cleanly with only the minimum required fields', () => {
    const { container } = renderCard(makeHotel());
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when all optional fields are null', () => {
    const { container } = renderCard(
      makeHotel({
        city: null,
        country: null,
        price_range: null,
        star_rating: null,
        images: null,
        hotel_type: null,
      }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when optional fields are the literal strings "null"/"undefined"', () => {
    const { container } = renderCard(
      makeHotel({
        // Simulated CMS/API drift — these must never render verbatim.
        city: 'null',
        country: 'undefined',
        hotel_type: 'null',
      }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when name contains an unrendered moustache template', () => {
    const { container } = renderCard(
      makeHotel({ name: '{{hotel_name}}' }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('does not leak when fields come back as objects (API drift)', () => {
    const { container } = renderCard(
      makeHotel({
        city: { name: 'Berlin' } as unknown,
        country: { iso: 'DE' } as unknown,
      }),
    );
    expectNoPlaceholderLeaks(container);
  });

  it('renders populated hotel without any leak', () => {
    const { container } = renderCard(
      makeHotel({
        name: 'Axel Hotel Berlin',
        city: 'Berlin',
        country: 'Germany',
        star_rating: 4,
        price_range: 3,
        lgbtq_friendly: true,
        hotel_type: 'hotel',
        images: ['https://example.com/x.jpg'],
      }),
    );
    expectNoPlaceholderLeaks(container);
  });
});
