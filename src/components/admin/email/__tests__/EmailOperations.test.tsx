import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailOperations } from '../EmailOperations';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const data = {
  health: {
    as_of: '2026-10-21T12:00:00Z',
    window_days: 30,
    states: { uncertain: 1 },
    queue_oldest_seconds: null,
    expired_leases: 0,
    acceptance_p95_seconds: null,
    delivery_p95_seconds: null,
    unmatched_provider_events: 0,
    retention: { payload_days: 90 },
    dlq_visibility: 'DLQ depth requires the Cloudflare dashboard.',
  },
  jobs: [],
  events: [],
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({ data, error: null });
});
describe('email operations', () => {
  it('reports absent latency evidence honestly and inspects an identity without dispatching', async () => {
    render(<EmailOperations />);
    await screen.findByText('uncertain: 1');
    expect(screen.getAllByText('No observations')).toHaveLength(3);
    api.invoke.mockImplementation(async (_url, options) =>
      options?.body
        ? { data: { found: true, status: 'delivered', changed: true, sent: false }, error: null }
        : { data, error: null },
    );
    fireEvent.change(screen.getByLabelText('Message ID'), {
      target: { value: '77777777-0000-4000-8000-000000000001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect receipt' }));
    await screen.findByText(/Database receipt updated.*No email was sent/);
    expect(api.invoke).toHaveBeenCalledWith('email-operations', {
      body: { action: 'reconcile', id: '77777777-0000-4000-8000-000000000001' },
    });
    expect(api.invoke.mock.calls.some((c) => c[0] === 'email-dispatch')).toBe(false);
  });
  it('keeps observed health visible when refresh fails instead of presenting zero failures', async () => {
    render(<EmailOperations />);
    await screen.findByText('uncertain: 1');
    api.invoke.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh operations' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not load'));
    expect(screen.getByText('uncertain: 1')).toBeInTheDocument();
  });
});
