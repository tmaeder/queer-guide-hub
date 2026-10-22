import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailExperiments } from '../EmailExperiments';
import { EmailCatalogBlocks } from '../EmailCatalogBlocks';
import { EmailMeasurement } from '../EmailMeasurement';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
beforeEach(() => {
  api.invoke.mockReset();
});
const campaign = {
  id: '77777777-0000-4000-8000-000000000001',
  version: 3,
  template_key: 'welcome',
  status: 'draft',
};
const templates = [
  { template_key: 'welcome', name: 'Welcome', is_active: true },
  { template_key: 'other', name: 'Other', is_active: true },
];
describe('email content and measurement', () => {
  it('preserves experiment drafts per campaign version and pins the version sent to the server', async () => {
    api.invoke.mockResolvedValue({ data: { experiments: [] }, error: null });
    const { rerender } = render(
      <EmailExperiments campaign={campaign} templates={templates} ready />,
    );
    await screen.findByLabelText('Outcome window (days)');
    fireEvent.change(screen.getByLabelText('Outcome window (days)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Variant B template'), { target: { value: 'other' } });
    rerender(
      <EmailExperiments campaign={{ ...campaign, version: 4 }} templates={templates} ready />,
    );
    await waitFor(() => expect(screen.getByLabelText('Outcome window (days)')).toHaveValue(7));
    rerender(<EmailExperiments campaign={campaign} templates={templates} ready />);
    await waitFor(() => expect(screen.getByLabelText('Outcome window (days)')).toHaveValue(12));
    fireEvent.click(screen.getByRole('button', { name: 'Save experiment definition' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: expect.objectContaining({
          action: 'experiment-create',
          expected_version: 3,
          window_seconds: 1036800,
        }),
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No email is sent and no outcome window has started',
    );
  });
  it('holds stale experiment responses outside the selected campaign', async () => {
    let complete!: (value: unknown) => void;
    api.invoke
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValue({ data: { experiments: [] }, error: null });
    const { rerender } = render(
      <EmailExperiments campaign={campaign} templates={templates} ready={false} />,
    );
    rerender(
      <EmailExperiments
        campaign={{ ...campaign, id: '77777777-0000-4000-8000-000000000002' }}
        templates={templates}
        ready={false}
      />,
    );
    await screen.findByLabelText('Declared app outcome');
    await act(async () => {
      complete({
        data: {
          experiments: [{ id: 'stale', version: 3, goal: 'stale-experiment-goal', variants: [] }],
        },
        error: null,
      });
    });
    expect(screen.queryByText(/stale-experiment-goal/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save experiment definition' })).toBeDisabled();
  });
  it('never displays a catalog preview or failure from a previously selected draft', async () => {
    let complete!: (value: unknown) => void;
    api.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const first = [{ kind: 'venue' as const, id: campaign.id }];
    const { rerender } = render(<EmailCatalogBlocks value={first} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview public blocks' }));
    rerender(<EmailCatalogBlocks value={[]} onChange={vi.fn()} />);
    await act(async () => {
      complete({
        data: {
          blocks: [
            {
              kind: 'venue',
              id: campaign.id,
              title: 'Stale private-looking title',
              available: true,
            },
          ],
        },
        error: null,
      });
    });
    expect(screen.queryByText('Stale private-looking title')).not.toBeInTheDocument();
  });
  it('retains observed results on a refresh outage and distinguishes completed and open windows', async () => {
    api.invoke.mockResolvedValueOnce({
      data: {
        as_of: '2026-10-22T00:00:00Z',
        window_days: 30,
        welcome_activation: {
          accepted_accounts: 9,
          closed_windows: 6,
          outcome_accounts: 2,
          open_windows: 3,
          observation_days: 7,
        },
        verified_app_events: [],
        journey_states: [],
        journey_steps: [],
      },
      error: null,
    });
    render(<EmailMeasurement />);
    await screen.findByText(
      /2 accounts claimed a username during 6 completed 7-day observation windows/,
    );
    expect(screen.getByText(/3 observation windows remain open/)).toBeInTheDocument();
    api.invoke.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh measurements' }));
    await screen.findByRole('alert');
    expect(screen.getByText(/2 accounts claimed a username/)).toBeInTheDocument();
    expect(
      screen.getByText(/Purchases, causal lift and automatic winners are not inferred/),
    ).toBeInTheDocument();
  });
});
