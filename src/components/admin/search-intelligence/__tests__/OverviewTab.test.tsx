/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: callMock,
}));

import { OverviewTab } from '../OverviewTab';

beforeEach(() => callMock.mockReset());

describe('OverviewTab', () => {
  it('shows loading then error message on failure', async () => {
    callMock.mockResolvedValue({ success: false, error: 'forbidden' });
    render(<OverviewTab />);
    await waitFor(() => expect(screen.getByText(/Could not load: forbidden/)).toBeInTheDocument());
  });

  it('renders one card per managed index', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: {
        managed: ['venues', 'events'],
        meili: [{ uid: 'venues' }],
        db_counts: { venues: 1234, events: 56 },
      },
    });
    render(<OverviewTab />);
    await waitFor(() => expect(screen.getByText('venues')).toBeInTheDocument());
    expect(screen.getByText('events')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/missing in Meili/)).toBeInTheDocument();
  });
});
