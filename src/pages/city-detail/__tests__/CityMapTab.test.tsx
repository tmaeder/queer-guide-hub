/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';

import { CityMapTab } from '../CityMapTab';

function FakeMap() { return <div data-testid="explore-map">map</div>; }

describe('CityMapTab', () => {
  it('renders nothing when coords missing', () => {
    const { container } = render(<CityMapTab city={{ id: 'c1' } as never} ExploreMap={FakeMap} Suspense={Suspense} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders map when coords present', () => {
    render(<CityMapTab city={{ id: 'c1', latitude: 52, longitude: 13 } as never} ExploreMap={FakeMap} Suspense={Suspense} />);
    expect(screen.getByTestId('explore-map')).toBeInTheDocument();
  });
});
