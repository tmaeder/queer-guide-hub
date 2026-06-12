/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useTrustTier', () => ({
  useMyTier: () => ({ data: { tier: 'visitor', points: 0 }, isLoading: false }),
  nextTier: () => null,
  TIER_ORDER: ['visitor', 'local', 'scout', 'steward'],
  TIER_REQUIREMENTS: { visitor: {}, local: {}, scout: {}, steward: {} },
}));
vi.mock('@/components/profile/TrustTierBadge', () => ({ TrustTierBadge: () => null }));

import { TrustTierLadder } from '../TrustTierLadder';

describe('TrustTierLadder', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><TrustTierLadder /></MemoryRouter>);
    expect(container.textContent).toContain('Trust tier');
  });
});
