/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    addPlace: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock('@/hooks/useVenueSocialSignals', () => ({ useVenueSocialSignals: () => ({ data: null }) }));

import { AddPlaceDialog } from '../AddPlaceDialog';

describe('AddPlaceDialog', () => {
  it('renders closed without crashing', () => {
    const { container } = render(<AddPlaceDialog open={false} onClose={vi.fn()} tripId="t1" days={[]} />);
    expect(container).toBeTruthy();
  });
});
