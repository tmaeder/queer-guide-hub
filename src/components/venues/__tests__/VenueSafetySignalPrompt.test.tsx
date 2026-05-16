/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useVenueSafetySignals', () => ({
  useSubmitSafetySignal: () => ({ mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) }),
  useVenueSafetyPrompts: () => ({ data: [], isLoading: false }),
}));

import { VenueSafetySignalPrompt } from '../VenueSafetySignalPrompt';

describe('VenueSafetySignalPrompt', () => {
  it('renders closed without crashing', () => {
    const { container } = render(<VenueSafetySignalPrompt venueId="v1" open={false} onOpenChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
