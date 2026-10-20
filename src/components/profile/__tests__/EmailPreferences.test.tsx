import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmailPreferences } from '../EmailPreferences';
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: api.invoke } },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { resolvedLanguage: 'en' },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({ data: { subscription: null }, error: null });
});
describe('account email preferences', () => {
  it('never enrolls a member automatically', async () => {
    render(<EmailPreferences />);
    await screen.findByRole('checkbox', { name: 'Newsletter' });
    expect(screen.getByRole('checkbox', { name: 'Newsletter' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Request email subscription' })).toBeDisabled();
    expect(api.invoke.mock.calls.every((c) => c[1]?.method === 'GET')).toBe(true);
  });
  it('requests confirmation only after explicit topic selection', async () => {
    render(<EmailPreferences />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Newsletter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request email subscription' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'subscribe',
          topics: ['newsletter'],
          locale: 'en',
          consent: true,
          unsubscribe: false,
        },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('confirm your subscription');
  });
  it('unsubscribes an existing member without changing account delivery', async () => {
    api.invoke.mockResolvedValue({
      data: { subscription: { status: 'subscribed', topics: ['events'], locale: 'de' } },
      error: null,
    });
    render(<EmailPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: 'Unsubscribe from updates' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'preferences',
          topics: ['events'],
          locale: 'de',
          consent: true,
          unsubscribe: true,
        },
      }),
    );
  });
});
