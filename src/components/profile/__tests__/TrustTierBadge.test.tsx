/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TrustTierBadge } from '../TrustTierBadge';

describe('TrustTierBadge', () => {
  it('renders with tier', () => {
    const { container } = render(<TrustTierBadge userId="u1" tier="local" />);
    expect(container).toBeTruthy();
  });
});
