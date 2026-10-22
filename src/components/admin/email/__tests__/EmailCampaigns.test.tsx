import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailCampaigns, type Campaign } from '../EmailCampaigns';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const campaign: Campaign = {
  id: '77777777-0000-4000-8000-000000000001',
  name: 'October update',
  status: 'draft',
  version: 3,
  review_state: 'submitted',
  topic: 'newsletter',
  template_key: 'welcome',
  locale: 'de',
  scheduled_at: null,
  segment_id: 'audience',
};
const detail = () => ({
  campaign: { ...campaign },
  version: {
    content: {
      subject: 'Saved subject',
      html_content: '<p>Immutable body</p>',
      text_content: 'Immutable body',
    },
  },
  versions: [{ version: 3, created_at: '2026-10-21T00:00:00Z' }],
  reviews: [],
  audiences: [],
});
const refresh = vi.fn(async () => {});
function mount() {
  return render(
    <EmailCampaigns
      campaigns={[campaign]}
      templates={[{ template_key: 'welcome', name: 'Welcome', is_active: true }]}
      refresh={refresh}
      audienceRevision={0}
    />,
  );
}
beforeEach(() => {
  refresh.mockClear();
  api.invoke.mockReset();
  api.invoke.mockImplementation(async (url) => ({
    data: url.includes('resource=segments')
      ? { segments: [{ id: 'audience', name: 'German members', version: 7, status: 'active' }] }
      : detail(),
    error: null,
  }));
});
describe('campaign preparation and governance', () => {
  it('saves against the loaded version and exact combined audience, without sending', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft October update' }));
    await screen.findByDisplayValue('October update');
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'Revised update' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview audience count' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: {
          action: 'segment-preview',
          id: 'audience',
          topic: 'newsletter',
          locale: 'de',
          limit: 1,
        },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: {
          action: 'campaign-save',
          id: campaign.id,
          expected_version: 3,
          name: 'Revised update',
          template_key: 'welcome',
          topic: 'newsletter',
          locale: 'de',
          scheduled_at: null,
          segment_id: 'audience',
          catalog_references: [],
        },
      }),
    );
    expect(api.invoke.mock.calls.some((c) => c[1]?.body?.action === 'campaign-send')).toBe(false);
  });
  it('preserves a conflicting draft and explicitly clones it without an old identity or approval', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft October update' }));
    await screen.findByDisplayValue('October update');
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'My unsaved draft' },
    });
    api.invoke.mockImplementation(async (_url, options) =>
      options?.body?.action === 'campaign-save'
        ? { error: { context: { status: 409 } } }
        : { data: detail(), error: null },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Another administrator changed/);
    expect(screen.getByLabelText('Campaign name')).toHaveValue('My unsaved draft');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as new draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenLastCalledWith('email-admin', {
        body: {
          action: 'campaign-save',
          name: 'My unsaved draft',
          template_key: 'welcome',
          topic: 'newsletter',
          locale: 'de',
          scheduled_at: null,
          segment_id: 'audience',
          catalog_references: [],
        },
      }),
    );
  });
  it('binds review and snapshot actions to the displayed immutable version', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Review October update' }));
    await screen.findByText('Saved subject');
    expect(screen.getByTitle('Campaign content preview')).toHaveAttribute('sandbox', '');
    fireEvent.click(screen.getByRole('button', { name: 'Approve this version' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: {
          action: 'campaign-review',
          id: campaign.id,
          expected_version: 3,
          decision: 'approve',
        },
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Collect audience snapshot' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collect audience snapshot' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: { action: 'campaign-snapshot', id: campaign.id, expected_version: 3 },
      }),
    );
  });
  it('serializes a pending edit with audience counts and releases the editor after loading', async () => {
    let resolve!: (value: unknown) => void;
    api.invoke.mockImplementation(async (url) =>
      url.includes('resource=campaign')
        ? new Promise((r) => {
            resolve = r;
          })
        : { data: { segments: [] }, error: null },
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit draft October update' }));
    expect(screen.getByRole('button', { name: 'Preview audience count' })).toBeDisabled();
    expect(screen.getByLabelText('Campaign name')).toBeDisabled();
    resolve({ data: detail(), error: null });
    await screen.findByDisplayValue('October update');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview audience count' })).toBeEnabled(),
    );
  });
  it('reports a failed detail request without discarding the editor', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Keep me' } });
    api.invoke.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Review October update' }));
    await screen.findByText(/Could not load the campaign/);
    expect(screen.getByLabelText('Campaign name')).toHaveValue('Keep me');
  });
});
