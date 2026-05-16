/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/components/travel/CityTravelHub', () => ({ CityTravelHub: () => <div>CityTravelHub</div> }));
vi.mock('@/components/personalization/SimilarCities', () => ({ SimilarCities: () => <div>SimilarCities</div> }));
vi.mock('@/components/animation/ScrollReveal', () => ({ ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { CityTravelTab } from '../CityTravelTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('CityTravelTab', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <CityTravelTab city={{ id: 'c1', name: 'Berlin' } as never} effectiveIata={null} hasAirport={false} nearestAirport={null} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
