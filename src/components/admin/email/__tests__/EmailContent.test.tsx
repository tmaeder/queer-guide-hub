import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailContent } from '../EmailContent';
import { MemoryRouter } from 'react-router';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
const base = {
  subject: 'Hello {{name}}',
  html_content: '<p>{{name}}</p>',
  text_content: '{{name}}',
};
const translation = {
  ...base,
  subject: 'Hallo {{name}}',
  locale: 'de',
  version: 4,
  is_active: true,
};
function mount() {
  render(
    <MemoryRouter>
      <EmailContent templates={[{ template_key: 'welcome', name: 'Welcome', is_active: true }]} />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockImplementation(async (url, options) => ({
    data:
      options?.body?.action === 'content-preview'
        ? { template: base }
        : url.includes('locale=')
          ? { localizations: [translation] }
          : { localizations: [{ locale: 'de', version: 4, is_active: true }] },
    error: null,
  }));
});
describe('localized email content', () => {
  it('binds translation edits to the loaded version and preserves conflicting work', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Base template'), { target: { value: 'welcome' } });
    await screen.findByDisplayValue('Hello {{name}}');
    fireEvent.change(screen.getByLabelText('Saved translation'), { target: { value: 'de' } });
    await screen.findByDisplayValue('Hallo {{name}}');
    expect(screen.getByLabelText('Locale code')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Localized subject'), {
      target: { value: 'Grüezi {{name}}' },
    });
    api.invoke.mockResolvedValue({ error: { context: { status: 409 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save translation' }));
    await screen.findByText(/This translation changed/);
    expect(screen.getByLabelText('Localized subject')).toHaveValue('Grüezi {{name}}');
    expect(api.invoke).toHaveBeenCalledWith('email-admin', {
      body: {
        action: 'localization-save',
        template_key: 'welcome',
        locale: 'de',
        subject: 'Grüezi {{name}}',
        html_content: base.html_content,
        text_content: base.text_content,
        expected_version: 4,
        is_active: true,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep for a different locale' }));
    expect(screen.getByLabelText('Locale code')).toBeEnabled();
    expect(screen.getByLabelText('Locale code')).toHaveValue('');
  });
  it('prevents required base variables disappearing and preserves drafts across failed detail loads', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Base template'), { target: { value: 'welcome' } });
    await screen.findByDisplayValue('Hello {{name}}');
    fireEvent.change(screen.getByLabelText('Localized subject'), { target: { value: 'Bonjour' } });
    fireEvent.change(screen.getByLabelText('Localized HTML'), {
      target: { value: '<p>Bonjour</p>' },
    });
    fireEvent.change(screen.getByLabelText('Localized plain text'), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('name');
    expect(screen.getByRole('button', { name: 'Save translation' })).toBeDisabled();
    api.invoke.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard translation edits' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('edits are preserved'),
    );
    expect(screen.getByLabelText('Localized subject')).toHaveValue('Bonjour');
  });
});
