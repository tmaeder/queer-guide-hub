import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import EmailPlatform from '../EmailPlatform';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
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
  api.invoke.mockResolvedValue({ data, error: null });
});
describe('integrated admin email workspace', () => {
  it('exposes the provider restriction and links to the existing editor', async () => {
    render(
      <MemoryRouter>
        <EmailPlatform />
      </MemoryRouter>,
    );
    await screen.findByText('Prepare a campaign');
    expect(screen.getByRole('status')).toHaveTextContent('transactional email only');
    expect(screen.getByRole('link', { name: 'Edit templates' })).toHaveAttribute(
      'href',
      '/admin/email-templates',
    );
    expect(screen.queryByRole('button', { name: 'Send campaign' })).not.toBeInTheDocument();
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
