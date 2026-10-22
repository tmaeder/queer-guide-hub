import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmailUpdates from '../EmailUpdates';
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
vi.mock('@/components/auth/TurnstileWidget', () => ({
  isTurnstileEnabled: true,
  TurnstileWidget: ({ onVerify, action }: { onVerify: (s: string) => void; action: string }) => (
    <button type="button" onClick={() => onVerify('challenge-fixture')}>
      Verify {action}
    </button>
  ),
}));
beforeEach(() => {
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
describe('public email update choices', () => {
  it('requires explicit topic consent and purpose-bound verification before requesting confirmation', async () => {
    render(<EmailUpdates />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'visitor@example.com' },
    });
    expect(screen.getByRole('button', { name: 'Request confirmation email' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Newsletter'));
    fireEvent.click(screen.getByLabelText(/I request the email updates/));
    fireEvent.click(screen.getByRole('button', { name: 'Verify email-subscribe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request confirmation email' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'subscribe',
          email: 'visitor@example.com',
          locale: 'en',
          topics: ['newsletter'],
          consent: true,
          turnstileToken: 'challenge-fixture',
        },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'No subscription is active until confirmed',
    );
  });
  it('requests a private management link without claiming subscription membership', async () => {
    render(<EmailUpdates />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage a subscription' }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify email-manage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request a private link' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'request_management',
          email: 'visitor@example.com',
          turnstileToken: 'challenge-fixture',
        },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If this mailbox has a confirmed subscription',
    );
  });
});
