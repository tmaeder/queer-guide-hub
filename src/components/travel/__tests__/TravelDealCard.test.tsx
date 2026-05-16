/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TravelDealCard } from '../TravelDealCard';

describe('TravelDealCard', () => {
  it('renders loading', () => {
    const { container } = render(<TravelDealCard loading />);
    expect(container).toBeTruthy();
  });
  it('renders deal', () => {
    const { container } = render(
      <TravelDealCard deal={{ origin: 'JFK', destination: 'BER', price: 500, currency: 'USD' } as never} originCity="NY" destinationCity="Berlin" />,
    );
    expect(container).toBeTruthy();
  });
});
