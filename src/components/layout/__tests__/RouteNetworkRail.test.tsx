import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteNetworkRail } from '../RouteNetworkRail';

describe('RouteNetworkRail', () => {
  it('maps the current page family to one visibly active line', () => {
    const { container } = render(<RouteNetworkRail pathname="/de/venues" />);

    const rail = container.querySelector('.route-network-rail');
    expect(rail).toHaveClass('route-network-rail--pink');
    expect(container.querySelectorAll('.route-network-rail__track')).toHaveLength(1);
    // No unlabelled stations: a stop on this rail would name nothing, and a
    // circle in the stretched SVG renders as an oval.
    expect(container.querySelectorAll('svg circle')).toHaveLength(0);
    expect(container).toHaveTextContent('venues');
  });
});
