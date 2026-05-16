/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: () => ({ countries: [], isLoading: false }) }));

import { TripSafetyBriefing } from '../TripSafetyBriefing';

describe('TripSafetyBriefing', () => {
  it('renders without crashing', () => {
    const { container } = render(<TripSafetyBriefing tripPlaces={[]} tripDays={[]} tripId="t1" />);
    expect(container).toBeTruthy();
  });
});
