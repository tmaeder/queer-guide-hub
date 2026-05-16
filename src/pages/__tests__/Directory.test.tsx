/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCountries: () => ({ countries: [], loading: false }),
  useOptimizedCities: () => ({ cities: [], loading: false }),
}));
vi.mock('@/hooks/useDirectory', () => ({ useDirectory: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useContinents', () => ({ useContinents: () => ({ data: [], isLoading: false }) }));

import Directory from '../Directory';

describe('Directory', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Directory /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
