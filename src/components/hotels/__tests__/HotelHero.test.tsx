/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HotelHero } from '../HotelHero';

describe('HotelHero', () => {
  it('renders', () => {
    const hotel = { id: 'h', name: 'X', slug: 'x', city: 'B', country: 'DE' } as never;
    const { container } = render(<MemoryRouter><HotelHero hotel={hotel} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
