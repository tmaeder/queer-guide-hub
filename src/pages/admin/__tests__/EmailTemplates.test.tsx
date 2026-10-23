import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import EmailTemplates from '../EmailTemplates';

const api = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), invoke: vi.fn() }));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchEmailTemplates: api.fetch,
  upsertEmailTemplate: api.save,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'editor@example.com' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const first = {
  id: '1',
  template_key: 'welcome',
  name: 'Welcome',
  subject: 'Hello {{name}}',
  html_content: '<p>Hello {{name}}</p>',
  text_content: 'Hello {{name}}',
  variables: [{ name: 'name', description: 'Name' }],
  is_active: true,
  updated_at: '2026-10-13',
  created_at: '2026-10-13',
};
const second = { ...first, id: '2', name: 'Reminder', template_key: 'reminder' };
async function select() {
  render(
    <MemoryRouter initialEntries={['/admin/email-templates']}>
      <EmailTemplates />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: /Welcome/ }));
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.fetch.mockResolvedValue({ data: [first, second], error: null });
  api.save.mockResolvedValue({ error: null });
  api.invoke.mockResolvedValue({ error: null });
});
describe('EmailTemplates safeguards', () => {
  it('protects an unsaved draft when selecting another template', async () => {
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Subject line'), {
      target: { value: 'Draft {{name}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reminder/ }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Subject line')).toHaveValue('Draft {{name}}');
    expect(api.save).not.toHaveBeenCalled();
  });
  it('blocks saving a removed subject variable', async () => {
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Subject line'), { target: { value: 'Hello' } });
    expect(screen.getByText('Restore {{name}} in the subject.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
  it('preserves the draft after a save failure and allows retry', async () => {
    api.save.mockResolvedValueOnce({ error: new Error('offline') });
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Subject line'), {
      target: { value: 'Changed {{name}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Could not save the template/)).toBeInTheDocument();
    expect(screen.getByLabelText('Subject line')).toHaveValue('Changed {{name}}');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: 'Changed {{name}}', html_content: first.html_content }),
      '1',
    );
  });
  it('requires samples and sends the explicitly saved template version', async () => {
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Test email' }));
    expect(screen.getByLabelText('Recipient email')).toHaveValue('editor@example.com');
    expect(screen.getByLabelText('Recipient email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Recipient email')).toHaveAccessibleDescription(
      'Tests go to your verified admin email address. Use the Email workspace for production sends.',
    );
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('send-templated-email', {
        body: {
          template_key: 'welcome',
          to_email: 'editor@example.com',
          variables: { name: 'Alex' },
          is_test: true,
        },
      }),
    );
  });
  it('shows a retry for a failed registry load', async () => {
    api.fetch.mockResolvedValueOnce({ data: [], error: new Error('offline') });
    render(
      <MemoryRouter>
        <EmailTemplates />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /Welcome/ })).toBeInTheDocument();
  });
  it('clears browser recovery when changes are reverted', async () => {
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Subject line'), {
      target: { value: 'Draft {{name}}' },
    });
    await waitFor(() => expect(sessionStorage.getItem('email-draft:u1:1')).toContain('Draft'));
    fireEvent.change(screen.getByLabelText('Subject line'), { target: { value: first.subject } });
    await waitFor(() => expect(sessionStorage.getItem('email-draft:u1:1')).toBeNull());
  });
  it('keeps the block editor mounted when checking plain text', async () => {
    await select();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use block editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Convert draft' }));
    // This path loads the real lazy editor and its dependencies on a cold run.
    const canvas = await screen.findByRole(
      'textbox',
      { name: 'Email block content' },
      { timeout: 10000 },
    );
    const inspector = await screen.findByRole('complementary', { name: 'Email properties' });
    await waitFor(() => {
      for (const input of inspector.querySelectorAll('input')) {
        expect(input).toHaveAccessibleName();
      }
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Plain text' }));
    expect(canvas.isConnected).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Email content' }));
    expect(screen.getByRole('textbox', { name: 'Email block content' })).toBe(canvas);
  }, 30000);
});
