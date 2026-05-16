/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useTravelDeals', () => ({ useTravelDeals: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useVisitorOrigin', () => ({ useVisitorOrigin: () => ({ originIata: null, originCity: null, loading: false }) }));

import { TravelDealsSection } from '../TravelDealsSection';

describe('TravelDealsSection', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><TravelDealsSection destinationIata="BER" destinationCity="Berlin" /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
