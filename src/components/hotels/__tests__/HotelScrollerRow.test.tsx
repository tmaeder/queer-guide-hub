/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../HotelCard', () => ({
  HotelCard: (p: { hotel: { id: string; name: string } }) => <div data-testid="hotel">{p.hotel.name}</div>,
}));

import { HotelScrollerRow } from '../HotelScrollerRow';

describe('HotelScrollerRow', () => {
  it('renders nothing when hotels list empty', () => {
    const { container } = render(<HotelScrollerRow title="T" hotels={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, subtitle, and one card per hotel', () => {
    render(
      <HotelScrollerRow
        title="Top hotels"
        subtitle="best of"
        hotels={[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as never}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Top hotels' })).toBeInTheDocument();
    expect(screen.getByText('best of')).toBeInTheDocument();
    expect(screen.getAllByTestId('hotel')).toHaveLength(2);
  });
});
