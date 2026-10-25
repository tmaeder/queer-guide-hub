import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import EmailPlatform from '../EmailPlatform';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
vi.mock('../EmailTemplates', async () => {
  const { useState } = await import('react');
  return {
    default: function TemplateDesigner({ embedded }: { embedded?: boolean }) {
      const [draft, setDraft] = useState('');
      return (
        <section aria-label="Template designer">
          <p>{embedded ? 'Integrated designer' : 'Standalone designer'}</p>
          <input
            aria-label="Designer draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </section>
      );
    },
  };
});
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current workspace URL">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data = {
  configured: true,
  templates: [{ template_key: 'welcome', name: 'Welcome', is_active: true }],
  campaigns: [],
  messages: [],
  subscribers: 0,
  suppressions: 0,
};
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockImplementation(async (url) => ({
    data: url.startsWith('email-journeys')
      ? { journeys: [], runs: [], versions: [] }
      : url.includes('resource=segments')
        ? { segments: [] }
        : url.includes('resource=contacts')
          ? { contacts: [], next: null }
          : data,
    error: null,
  }));
});
describe('integrated admin email workspace', () => {
  it('exposes the provider restriction and the integrated template tab', async () => {
    render(
      <MemoryRouter>
        <EmailPlatform />
      </MemoryRouter>,
    );
    await screen.findByText('Prepare a campaign');
    expect(screen.getByRole('status', { name: 'Cloudflare email capability' })).toHaveTextContent(
      'transactional email only',
    );
    expect(screen.getByRole('tab', { name: 'Templates', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send campaign' })).not.toBeInTheDocument();
  });
  it('opens deep-linked templates, preserves drafts across tabs and restores browser history', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/email?tab=templates&source=branding']}>
        <EmailPlatform />
        <LocationProbe />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Integrated designer')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Designer draft'), {
      target: { value: 'Unfinished email' },
    });
    await user.click(screen.getByRole('tab', { name: 'Campaigns', exact: true }));
    expect(screen.getByLabelText('Current workspace URL')).toHaveTextContent(
      '/admin/email?tab=campaigns&source=branding',
    );
    expect(screen.getByLabelText('Designer draft')).toHaveValue('Unfinished email');
    await user.click(screen.getByRole('button', { name: 'Browser back', exact: true }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Templates', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(screen.getByLabelText('Designer draft')).toHaveValue('Unfinished email');
  });
  it('keeps templates usable when the delivery overview fails', async () => {
    api.invoke.mockResolvedValue({ error: new Error('unavailable') });
    render(
      <MemoryRouter initialEntries={['/admin/email?tab=templates']}>
        <EmailPlatform />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'Template designer' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Delivery', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
  });
  it('falls back to Campaigns for an unknown tab', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/email?tab=missing']}>
        <EmailPlatform />
      </MemoryRouter>,
    );
    await screen.findByText('Prepare a campaign');
    expect(screen.getByRole('tab', { name: 'Campaigns', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('saves a draft against a real template without dispatching', async () => {
    render(
      <MemoryRouter>
        <EmailPlatform />
      </MemoryRouter>,
    );
    await screen.findByText('Prepare a campaign');
    fireEvent.change(screen.getByLabelText('Campaign name'), {
      target: { value: 'October update' },
    });
    fireEvent.change(screen.getByLabelText('Saved email template'), {
      target: { value: 'welcome' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-admin', {
        body: {
          action: 'campaign-save',
          name: 'October update',
          template_key: 'welcome',
          topic: 'newsletter',
          locale: null,
          scheduled_at: null,
          segment_id: null,
          catalog_references: [],
        },
      }),
    );
    expect(api.invoke.mock.calls.some((c) => c[1]?.body?.action === 'campaign-send')).toBe(false);
  });
  it('keeps unsaved audience edits when switching workspace tabs', async () => {
    api.invoke.mockImplementation(async (url) => ({
      data: url.includes('resource=segments') ? { segments: [] } : data,
      error: null,
    }));
    render(
      <MemoryRouter>
        <EmailPlatform />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Audiences' }));
    fireEvent.change(screen.getByLabelText('Audience name'), {
      target: { value: 'Unfinished audience' },
    });
    await user.click(screen.getByRole('tab', { name: 'Campaigns' }));
    await user.click(screen.getByRole('tab', { name: 'Audiences' }));
    expect(screen.getByLabelText('Audience name')).toHaveValue('Unfinished audience');
  });
  it('shows query failures instead of claiming the lists are empty', async () => {
    api.invoke.mockResolvedValue({ error: new Error('unavailable') });
    render(
      <MemoryRouter>
        <EmailPlatform />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
