/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: callMock,
}));

import { SearchDebuggerTab } from '../SearchDebuggerTab';

beforeEach(() => callMock.mockReset());

describe('SearchDebuggerTab', () => {
  it('renders inputs + Run button', () => {
    render(<SearchDebuggerTab />);
    expect(screen.getByLabelText(/Query/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Meili filter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run/ })).toBeInTheDocument();
  });

  it('Run disabled when query empty', () => {
    render(<SearchDebuggerTab />);
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /Run/ })).toBeDisabled();
  });

  it('shows error on failure', async () => {
    callMock.mockResolvedValue({ success: false, error: 'denied' });
    render(<SearchDebuggerTab />);
    fireEvent.click(screen.getByRole('button', { name: /Run/ }));
    await waitFor(() => expect(screen.getByText('denied')).toBeInTheDocument());
  });

  it('renders summary + top match when successful', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: {
        summary: { hits: 2, estimatedTotal: 50, processingTimeMs: 10, roundTripMs: 20, topMatches: [{ id: 'v1', title: 'Bar X', score: 0.95 }] },
        raw: {},
      },
    });
    render(<SearchDebuggerTab />);
    fireEvent.click(screen.getByRole('button', { name: /Run/ }));
    await waitFor(() => expect(screen.getByText('Bar X')).toBeInTheDocument());
    expect(screen.getByText(/Hits 2/)).toBeInTheDocument();
    expect(screen.getByText('0.950')).toBeInTheDocument();
  });
});
