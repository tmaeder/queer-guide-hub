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

// useIntimateMatches reaches useAuth (via useMyIntimateLikes); mock it so the
// component renders without an AuthProvider, mirroring the profile-hook mock.
vi.mock('@/hooks/useIntimateMatches', () => ({
  useIntimateMatches: () => ({ data: [] }),
  useMyIntimateLikes: () => ({ data: [] }),
  useMyIntimatePasses: () => ({ data: [] }),
  useLikeTarget: () => ({ mutate: vi.fn(), isPending: false }),
  usePassTarget: () => ({ mutate: vi.fn(), isPending: false }),
  useIncomingLikeListener: () => {},
}));

// Compatibility ranking reaches useAuth; mock it like the other data hooks so
// the component renders without an AuthProvider.
vi.mock('@/hooks/usePeopleDiscovery', () => ({
  usePeopleDiscovery: () => ({ data: [] }),
}));

import IntimateDiscovery from '../IntimateDiscovery';

describe('IntimateDiscovery', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><IntimateDiscovery /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
