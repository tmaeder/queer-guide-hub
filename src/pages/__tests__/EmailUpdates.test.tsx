import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmailUpdates from '../EmailUpdates';
const api = vi.hoisted(() => ({ invoke: vi.fn(), authCaptchaEnabled: true }));
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
  get isTurnstileEnabled() {
    return api.authCaptchaEnabled;
  },
  TurnstileWidget: ({
    onVerify,
    action,
    siteKey,
  }: {
    onVerify: (s: string) => void;
    action: string;
    siteKey?: string;
  }) =>
    siteKey || api.authCaptchaEnabled ? (
      <button
        type="button"
        data-site-key={siteKey ?? 'auth-default'}
        onClick={() => onVerify('challenge-fixture')}
      >
        Verify {action}
      </button>
    ) : null,
}));
beforeEach(() => {
  vi.unstubAllEnvs();
  api.authCaptchaEnabled = true;
  api.invoke.mockReset();
  api.invoke.mockResolvedValue({ data: { success: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('public email update choices', () => {
  it('uses the email widget independently of auth and obtains fresh proof for each purpose', () => {
    api.authCaptchaEnabled = false;
    vi.stubEnv('VITE_TURNSTILE_EMAIL_SITE_KEY', 'email-widget-fixture');
    render(<EmailUpdates />);
    const verification = screen.getByRole('button', { name: 'Verify email-subscribe' });
    expect(verification).toHaveAttribute('data-site-key', 'email-widget-fixture');
    expect(screen.queryByText(/Email verification is not configured/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'visitor@example.com' },
    });
    fireEvent.click(screen.getByLabelText('Newsletter'));
    fireEvent.click(screen.getByLabelText(/I request the email updates/));
    expect(screen.getByRole('button', { name: 'Request confirmation email' })).toBeDisabled();
    fireEvent.click(verification);
    expect(screen.getByRole('button', { name: 'Request confirmation email' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Manage a subscription' }));
    expect(screen.getByRole('button', { name: 'Request a private link' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Verify email-manage' }));
    expect(screen.getByRole('button', { name: 'Request a private link' })).toBeEnabled();
    expect(api.invoke).not.toHaveBeenCalled();
  });
  it('keeps public requests disabled when neither widget is configured', () => {
    api.authCaptchaEnabled = false;
    vi.stubEnv('VITE_TURNSTILE_EMAIL_SITE_KEY', ' ');
    render(<EmailUpdates />);
    expect(screen.getByRole('status')).toHaveTextContent('Email verification is not configured');
    expect(screen.queryByRole('button', { name: /Verify email-/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request confirmation email' })).toBeDisabled();
    expect(api.invoke).not.toHaveBeenCalled();
  });
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
