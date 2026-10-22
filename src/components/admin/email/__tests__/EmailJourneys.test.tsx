import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailJourneys } from '../EmailJourneys';
import {
  initialJourney,
  journeyGraphError,
  previewJourney,
  type JourneyGraph,
} from '../journeyGraph';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const journey = { id: 'journey-a', name: 'Account welcome', version: 4, status: 'paused' };
const version = {
  definition: initialJourney(),
  trigger_event: 'account.created',
  trigger_state: 'created',
  reentry: 'once_per_account',
};
const run = {
  id: 'run-12345678',
  journey_id: journey.id,
  version: 2,
  status: 'waiting',
  step_id: 'settle',
  due_at: '2026-10-21T15:00:00Z',
  last_error: null,
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockImplementation(async (url, options) => {
    if (url.includes('run_id='))
      return {
        data: {
          run,
          steps: [
            {
              step_id: 'profile',
              kind: 'branch',
              outcome: 'no',
              completed_at: '2026-10-21T14:59:00Z',
            },
          ],
        },
      };
    if (url.includes('?id=')) return { data: { journey, version } };
    if (options?.method === 'GET')
      return { data: { journeys: [journey], runs: [run], versions: [] } };
    if (options.body.action === 'cancel') return { data: { cancelled: true } };
    return { data: { journey: { id: journey.id, version: 5, status: options.body.status } } };
  });
});
async function edit() {
  render(<EmailJourneys />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Account welcome' }));
  await waitFor(() => expect(screen.getByLabelText('Journey name')).toHaveValue('Account welcome'));
}
describe('transactional journey operations', () => {
  it('loads the exact current definition and publishes with its expected version', async () => {
    await edit();
    fireEvent.change(screen.getByLabelText('Publication state'), { target: { value: 'active' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save journey' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-journeys', {
        body: expect.objectContaining({
          action: 'save',
          id: journey.id,
          expected_version: 4,
          status: 'active',
          definition: initialJourney(),
        }),
      }),
    );
    expect(await screen.findByText('Journey saved as active, version 5.')).toBeInTheDocument();
  });
  it('retains a conflicting edit and permits saving it as a separate inactive draft', async () => {
    await edit();
    api.invoke.mockImplementationOnce(async () => ({ error: { context: { status: 409 } } }));
    fireEvent.change(screen.getByLabelText('Journey name'), {
      target: { value: 'My preserved edits' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save journey' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep as new draft' }));
    expect(screen.getByLabelText('Journey name')).toHaveValue('My preserved edits');
    expect(screen.getByLabelText('Publication state')).toHaveValue('draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save journey' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenLastCalledWith('email-journeys', { method: 'GET' }),
    );
    const saves = api.invoke.mock.calls.filter(([, options]) => options?.body?.action === 'save');
    expect(saves.at(-1)?.[1].body).not.toHaveProperty('id');
    expect(saves.at(-1)?.[1].body).toMatchObject({ name: 'My preserved edits', status: 'draft' });
  });
  it('does not submit a broken connection when a referenced step is removed', async () => {
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Remove done' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Every connection needs an existing destination',
    );
    expect(screen.getByRole('button', { name: 'Save journey' })).toBeDisabled();
    expect(api.invoke.mock.calls.some(([, options]) => options?.body?.action === 'save')).toBe(
      false,
    );
  });
  it('shows persisted step evidence and cancels only the explicitly selected run', async () => {
    render(<EmailJourneys />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect run run-1234' }));
    expect(await screen.findByRole('region', { name: 'Run history' })).toHaveTextContent(
      'profile · branch · no',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run run-1234' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-journeys', {
        body: { action: 'cancel', run_id: run.id },
      }),
    );
    expect(await screen.findByText(/Run cancelled/)).toBeInTheDocument();
  });
  it('keeps draft fields while a list refresh fails', async () => {
    await edit();
    fireEvent.change(screen.getByLabelText('Journey name'), { target: { value: 'Unsaved work' } });
    api.invoke.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh journeys' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load journeys');
    expect(screen.getByLabelText('Journey name')).toHaveValue('Unsaved work');
  });
  it('ignores a stale history response after the editor is reset', async () => {
    let resolve!: (value: unknown) => void;
    render(<EmailJourneys />);
    await screen.findByRole('button', { name: 'Inspect run run-1234' });
    api.invoke.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect run run-1234' }));
    fireEvent.click(screen.getByRole('button', { name: 'New journey' }));
    await act(async () => {
      resolve({ data: { run, steps: [] } });
    });
    expect(screen.queryByRole('region', { name: 'Run history' })).not.toBeInTheDocument();
  });
});
describe('journey paths', () => {
  const graph: JourneyGraph = {
    start: 'profile',
    steps: {
      profile: { type: 'branch', condition: 'profile_exists', yes: 'welcome', no: 'settle' },
      settle: { type: 'wait', seconds: 60, next: 'welcome' },
      welcome: { type: 'welcome', next: 'done' },
      done: { type: 'end' },
    },
  };
  it('previews the chosen path and accumulated wait without invoking any endpoint', () => {
    expect(journeyGraphError(graph, 'account.created')).toBeNull();
    const trace = previewJourney(graph, { profile_exists: false, username_claimed: false });
    expect(trace.map((t) => t.id)).toEqual(['profile', 'settle', 'welcome', 'done']);
    expect(trace.at(-1)?.elapsed).toBe(60);
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it('rejects cycles, disconnected steps, invalid waits and incompatible email triggers', () => {
    expect(
      journeyGraphError(
        {
          ...graph,
          steps: { ...graph.steps, settle: { type: 'wait', seconds: 1, next: 'profile' } },
        },
        'account.created',
      ),
    ).toMatch(/cannot loop/);
    expect(
      journeyGraphError(
        { ...initialJourney(), steps: { ...initialJourney().steps, extra: { type: 'end' } } },
        'account.created',
      ),
    ).toMatch(/not connected/);
    expect(
      journeyGraphError(
        {
          ...graph,
          steps: { ...graph.steps, settle: { type: 'wait', seconds: 0, next: 'welcome' } },
        },
        'account.created',
      ),
    ).toMatch(/whole seconds/);
    expect(journeyGraphError(initialJourney(), 'event.rsvp.changed')).toMatch(/account-created/);
  });
});
