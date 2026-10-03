import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteNetworkRail } from '../RouteNetworkRail';

describe('RouteNetworkRail', () => {
  it('maps the current page family to one visibly active line', () => {
    const { container } = render(<RouteNetworkRail pathname="/de/venues" />);

    const rail = container.querySelector('.route-network-rail');
    expect(rail).toHaveClass('route-network-rail--pink');
    expect(container.querySelectorAll('.route-network-rail__track')).toHaveLength(1);
    expect(container.querySelectorAll('.route-network-rail__station')).toHaveLength(2);
    expect(container.querySelector('.route-network-rail__interchange')).toBeInTheDocument();
    expect(container).toHaveTextContent('venues');
  });
});
