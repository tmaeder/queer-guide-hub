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
  it('shows measured empty queues separately from unavailable observations', async () => {
    api.invoke.mockResolvedValue({
      data: {
        ...data,
        queues: {
          observed_at: '2026-10-25T18:00:00Z',
          events: { available: true, backlog_count: 0, backlog_bytes: 0, oldest_message_at: null },
          dead_letter: {
            available: false,
            backlog_count: null,
            backlog_bytes: null,
            oldest_message_at: null,
          },
        },
      },
      error: null,
    });
    render(<EmailOperations />);
    await screen.findByText('No pending events');
    expect(screen.getByText('Queued delivery events').parentElement).toHaveTextContent('0');
    expect(screen.getByText('Dead-letter delivery events').parentElement).toHaveTextContent(
      'Unavailable',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('surfaces a real dead-letter backlog without inventing its age or offering resend', async () => {
    api.invoke.mockResolvedValue({
      data: {
        ...data,
        queues: {
          observed_at: '2026-10-25T18:00:00Z',
          events: { available: true, backlog_count: 0, backlog_bytes: 0, oldest_message_at: null },
          dead_letter: {
            available: true,
            backlog_count: 2,
            backlog_bytes: 1460,
            oldest_message_at: null,
          },
        },
      },
      error: null,
    });
    render(<EmailOperations />);
    await screen.findByText('Age unavailable');
    expect(screen.getByText('Dead-letter delivery events').parentElement).toHaveTextContent('2');
    expect(screen.getByRole('alert')).toHaveTextContent('Delivery events need recovery');
    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
  });
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
