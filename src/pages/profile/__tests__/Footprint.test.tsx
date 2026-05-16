/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePlaceMarks', () => ({
  useMyPlaceMarks: () => ({ data: [], isLoading: false }),
  useFootprintEntities: () => ({ data: { venues: [], cities: [], events: [] }, isLoading: false }),
  useFootprintCityTotals: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Footprint from '../Footprint';

describe('Footprint', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Footprint /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
