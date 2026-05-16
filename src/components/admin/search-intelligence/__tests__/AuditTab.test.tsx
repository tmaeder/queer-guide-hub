/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: callMock,
}));

import { AuditTab } from '../AuditTab';

beforeEach(() => callMock.mockReset());

describe('AuditTab', () => {
  it('renders filter inputs', () => {
    callMock.mockResolvedValue({ success: true, data: [] });
    render(<AuditTab />);
    expect(screen.getByLabelText(/Action contains/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Resource type/i)).toBeInTheDocument();
  });

  it('shows empty message when no entries', async () => {
    callMock.mockResolvedValue({ success: true, data: [] });
    render(<AuditTab />);
    await waitFor(() => expect(screen.getByText(/No audit entries/)).toBeInTheDocument());
  });

  it('renders one card per audit entry', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: [
        { id: 'e1', action: 'sync', resource_type: 'venues', resource_id: 'v1', created_at: new Date().toISOString(), metadata: {} },
      ],
    });
    render(<AuditTab />);
    await waitFor(() => expect(screen.getByText('sync')).toBeInTheDocument());
    expect(screen.getByText('venues')).toBeInTheDocument();
  });

  it('surfaces error string when call fails', async () => {
    callMock.mockResolvedValue({ success: false, error: 'denied' });
    render(<AuditTab />);
    await waitFor(() => expect(screen.getByText('denied')).toBeInTheDocument());
  });
});
