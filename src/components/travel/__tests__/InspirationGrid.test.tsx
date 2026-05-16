/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useQueerVillages', () => ({ useQueerVillages: () => ({ villages: [], loading: false }) }));
vi.mock('@/hooks/useDiscoverableTrips', () => ({ useDiscoverableTrips: () => ({ data: [], isLoading: false }) }));

import { InspirationGrid } from '../InspirationGrid';

describe('InspirationGrid', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><InspirationGrid /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
