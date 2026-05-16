/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useTrips', () => ({ useTrips: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { ResumeTripStrip } from '../ResumeTripStrip';

describe('ResumeTripStrip', () => {
  it('renders', () => {
    const { container } = render(<ResumeTripStrip />);
    expect(container).toBeTruthy();
  });
});
