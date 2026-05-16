/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useVenueSafetySignals', () => ({
  useVenueSafetyScore: () => ({ data: null, isLoading: false }),
  useVenueSafetyPrompts: () => ({ data: [], isLoading: false }),
  useSubmitVenueSafety: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitSafetySignal: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { VenueSafetySignalDisplay } from '../VenueSafetySignalDisplay';

describe('VenueSafetySignalDisplay', () => {
  it('renders without crashing', () => {
    const { container } = render(<VenueSafetySignalDisplay venueId="v1" />);
    expect(container).toBeTruthy();
  });
});
