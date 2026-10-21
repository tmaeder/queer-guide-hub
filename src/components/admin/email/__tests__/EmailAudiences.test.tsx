import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailAudiences } from '../EmailAudiences';
import { ruleError, type Rule } from '../audienceRules';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const segment = {
  id: 'segment-1',
  name: 'Confirmed members',
  version: 2,
  status: 'active',
  rule: { field: 'status', op: 'eq', value: 'subscribed' },
};
const preview = {
  evaluated_at: '2026-10-21T10:00:00Z',
  matched: 3,
  eligible: 2,
  excluded: { recipient_suppressed: 1 },
  sample: [
    {
      id: 'contact-1',
      email: 'fixture@example.com',
      status: 'subscribed',
      locale: 'en',
      reason: 'recipient_suppressed',
    },
  ],
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockImplementation(async (_url, options) =>
    options?.method === 'GET'
      ? { data: { segments: [segment] } }
      : options.body.action === 'segment-preview'
        ? { data: { preview } }
        : { data: { segment: { id: segment.id, version: 3 } } },
  );
});
async function edit() {
  render(<EmailAudiences />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Confirmed members' }));
}
describe('admin audience workspace', () => {
  it('saves a nested definition with the expected version and explicit archive status', async () => {
    await edit();
    fireEvent.change(screen.getByLabelText('Match'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add condition to audience rule' }));
    expect(screen.getAllByLabelText('Contact field')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Definition status'), { target: { value: 'archived' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save audience' }));
    await screen.findByText('Audience saved as version 3.');
    expect(api.invoke).toHaveBeenCalledWith('email-admin', {
      body: {
        action: 'segment-save',
        id: segment.id,
        expected_version: 2,
        name: segment.name,
        status: 'archived',
        rule: { all: [segment.rule, segment.rule] },
      },
    });
  });
  it('shows exclusions and invalidates an old preview when the rule changes', async () => {
    await edit();
    fireEvent.click(screen.getByRole('button', { name: 'Preview audience' }));
    await screen.findByText('3 matching contacts · 2 eligible');
    expect(screen.getByText('Address suppressed: 1')).toBeInTheDocument();
    expect(screen.getByText('fixture@example.com')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
    expect(screen.queryByText('fixture@example.com')).not.toBeInTheDocument();
    expect(api.invoke).toHaveBeenCalledWith('email-admin', {
      body: { action: 'segment-preview', rule: segment.rule, topic: 'newsletter', limit: 25 },
    });
  });
  it('discards a late preview after an edit while the request is pending', async () => {
    await edit();
    let resolve!: (value: unknown) => void;
    api.invoke.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview audience' }));
    fireEvent.change(screen.getByLabelText('Check consent for topic'), {
      target: { value: 'events' },
    });
    resolve({ data: { preview } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview audience' })).toBeEnabled(),
    );
    expect(screen.queryByText('fixture@example.com')).not.toBeInTheDocument();
  });
  it('preserves conflicting edits and can save them as a separate definition', async () => {
    await edit();
    fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'My changes' } });
    api.invoke.mockResolvedValueOnce({ error: { context: { status: 409 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save audience' }));
    await screen.findByText(/Another administrator changed/);
    expect(screen.getByLabelText('Audience name')).toHaveValue('My changes');
    expect(screen.getByRole('button', { name: 'Save audience' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep edits as new audience' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save audience' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenLastCalledWith('email-admin?resource=segments', {
        method: 'GET',
      }),
    );
    const saves = api.invoke.mock.calls.filter(([, o]) => o?.body?.action === 'segment-save');
    expect(saves[1][1].body).not.toHaveProperty('id');
    expect(saves[1][1].body).not.toHaveProperty('expected_version');
  });
  it('reloads a conflicting definition only after explicit discard', async () => {
    await edit();
    api.invoke.mockResolvedValueOnce({ error: { context: { status: 409 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save audience' }));
    await screen.findByText(/Another administrator changed/);
    api.invoke.mockResolvedValueOnce({
      data: { segments: [{ ...segment, name: 'Saved elsewhere', version: 4 }] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard edits and reload saved definition' }),
    );
    await screen.findByText('Edit audience · version 4');
    expect(screen.getByLabelText('Audience name')).toHaveValue('Saved elsewhere');
  });
  it('keeps edits on transport failure and provides list retry without a false empty state', async () => {
    api.invoke.mockRejectedValueOnce(new Error('offline'));
    render(<EmailAudiences />);
    await screen.findByText('Saved audiences could not load.');
    expect(screen.queryByText(/No saved audiences yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry audience list' }));
    await screen.findByRole('button', { name: 'Edit Confirmed members' });
    fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'Keep me' } });
    api.invoke.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save audience' }));
    await screen.findByText(/Audience could not be saved/);
    expect(screen.getByLabelText('Audience name')).toHaveValue('Keep me');
  });
  it('blocks an invalid condition locally and keeps unsaved edits before switching definitions', async () => {
    await edit();
    fireEvent.change(screen.getByLabelText('Contact field'), { target: { value: 'locale' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'invalid' } });
    expect(screen.getByRole('button', { name: 'Preview audience' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save audience' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Confirmed members' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Check the condition values');
    expect(api.invoke.mock.calls).toHaveLength(1);
  });
  it('checks supported values and bounds before making a request', () => {
    expect(ruleError({ field: 'locale', op: 'in', value: ['en', 'de-CH'] })).toBeNull();
    expect(ruleError({ field: 'locale', op: 'in', value: ['en', ''] })).not.toBeNull();
    expect(ruleError({ event: 'delivery.delivered', within_days: 0, min_count: 1 })).not.toBeNull();
    expect(ruleError({ event: 'delivery.opened', within_days: 30, min_count: 1 })).not.toBeNull();
    let rule: Rule = segment.rule as Rule;
    for (let i = 0; i < 7; i++) rule = { not: rule };
    expect(ruleError(rule)).toMatch(/six nested/);
    expect(
      ruleError({ all: Array.from({ length: 11 }, () => segment.rule as Rule) }),
    ).not.toBeNull();
  });
});
