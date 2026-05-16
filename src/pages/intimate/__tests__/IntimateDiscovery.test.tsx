/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({ data: null, isLoading: false }),
  useIntimateDiscovery: () => ({ data: [], isLoading: false }),
}));

import IntimateDiscovery from '../IntimateDiscovery';

describe('IntimateDiscovery', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><IntimateDiscovery /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
