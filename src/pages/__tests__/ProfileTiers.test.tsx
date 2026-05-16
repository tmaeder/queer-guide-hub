/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('motion/react', () => ({ motion: new Proxy({}, { get: () => () => null }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/hooks/useTrustTier', () => ({
  useMyTier: () => ({ data: { tier: 'visitor', points: 0 }, isLoading: false }),
  nextTier: () => null,
  TIER_ORDER: ['visitor', 'local', 'scout', 'steward'],
  TIER_REQUIREMENTS: { visitor: {}, local: {}, scout: {}, steward: {} },
}));
vi.mock('@/components/profile/TrustTierBadge', () => ({ TrustTierBadge: () => null }));
vi.mock('@/components/ui/AnimatedBeamConnector', () => ({ AnimatedBeamConnector: () => null }));

import ProfileTiers from '../ProfileTiers';

describe('ProfileTiers', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><ProfileTiers /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
