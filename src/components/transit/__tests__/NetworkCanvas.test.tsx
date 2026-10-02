import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroNetwork, NetworkBackdrop } from '../NetworkCanvas';

describe('NetworkCanvas', () => {
  it('renders the complete four-track network with the active route family', () => {
    const { container } = render(<NetworkBackdrop activeTrack="green" />);

    expect(container.querySelector('.network-backdrop--green')).toBeInTheDocument();
    expect(container.querySelectorAll('.network-backdrop__track')).toHaveLength(4);
    expect(container.querySelectorAll('[pathLength="1"]')).toHaveLength(4);
  });

  it('renders the homepage network as a labelled interchange', () => {
    const { container } = render(<HeroNetwork />);

    expect(container.querySelectorAll('.hero-network__tracks path')).toHaveLength(4);
    expect(container.querySelectorAll('.hero-network__stations circle')).toHaveLength(3);
    expect(container).toHaveTextContent('You are here');
    expect(container).toHaveTextContent('Intersection');
    expect(container).toHaveTextContent('Community');
  });
});
