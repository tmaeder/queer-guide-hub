/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HotelCard } from '../HotelCard';

describe('HotelCard', () => {
  it('renders loading skeleton', () => {
    const { container } = render(<MemoryRouter><HotelCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders with hotel', () => {
    const hotel = { id: 'h', name: 'X', slug: 'x', type: 'hotel', city_name: 'Berlin', country_name: 'DE' } as never;
    const { container } = render(<MemoryRouter><HotelCard hotel={hotel} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
