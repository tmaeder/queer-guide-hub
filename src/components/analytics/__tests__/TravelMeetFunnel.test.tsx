import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TravelMeetFunnel } from '../TravelMeetFunnel';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: rpc }));
const summary = {
  browsed: 20,
  requested: 10,
  accepted: 5,
  started: 2,
  browse_to_request_pct: 50,
  request_to_accept_pct: 50,
  accept_to_conversation_pct: 40,
  browse_to_conversation_pct: 10,
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (days: string) => (
    <QueryClientProvider client={client}>
      <TravelMeetFunnel days={days} />
    </QueryClientProvider>
  );
  return { ...render(view('7')), view };
}
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: summary, error: null });
});
describe('Admin travel funnel', () => {
  it('shows distinct traveller counts and changes the window', async () => {
    const hook = mount();
    const row = await screen.findByRole('rowheader', { name: 'Requested to join' });
    expect(within(row.closest('tr')!).getByText('10')).toBeInTheDocument();
    expect(within(row.closest('tr')!).getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    hook.rerender(hook.view('30'));
    await waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith('travel_meet_funnel_summary', { p_days: 30 }),
    );
    expect(screen.getByText(/Anonymous visitors/)).toBeInTheDocument();
  });
  it('does not present loading or failures as zero activity and supports retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    mount();
    expect(
      screen.queryByText('No consented travel browsing recorded in this period.'),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry travel analytics' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
  it('shows zero counts with unavailable ratios for an empty cohort', async () => {
    rpc.mockResolvedValue({
      data: {
        browsed: 0,
        requested: 0,
        accepted: 0,
        started: 0,
        browse_to_request_pct: null,
        request_to_accept_pct: null,
        accept_to_conversation_pct: null,
        browse_to_conversation_pct: null,
      },
      error: null,
    });
    mount();
    expect(
      await screen.findByText('No consented travel browsing recorded in this period.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
