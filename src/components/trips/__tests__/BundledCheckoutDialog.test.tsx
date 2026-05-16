/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useBundledCheckout', () => ({
  useBundledCheckoutItems: () => ({ data: [], isLoading: false }),
  useCreateBundledCheckout: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { BundledCheckoutDialog } from '../BundledCheckoutDialog';

describe('BundledCheckoutDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(<BundledCheckoutDialog open={false} onOpenChange={vi.fn()} tripId="t1" />);
    expect(container).toBeTruthy();
  });
});
