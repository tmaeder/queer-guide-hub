import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import { EmailDeliveryStatus, type EmailDeliveryState } from '../EmailDeliveryStatus';
import { EmailView } from '../EmailView';
import type { MailboxEmail } from '@/hooks/useMailbox';
const i18n = createInstance();
beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
    interpolation: { escapeValue: false },
  });
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});
const state = (changes: Partial<EmailDeliveryState> = {}): EmailDeliveryState => ({
  status: 'accepted',
  loading: false,
  refreshing: false,
  error: false,
  onRefresh: vi.fn(),
  ...changes,
});
function display(props: EmailDeliveryState) {
  return render(
    <I18nextProvider i18n={i18n}>
      <EmailDeliveryStatus {...props} />
    </I18nextProvider>,
  );
}
it('distinguishes service acceptance from a real delivery receipt and inbox placement', () => {
  const view = display(state());
  expect(screen.getByRole('status')).toHaveTextContent('Delivery: Submitted');
  expect(screen.getByText('Delivery is not yet confirmed.')).toBeVisible();
  expect(screen.queryByText('Delivery: Delivered')).toBeNull();
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <EmailDeliveryStatus {...state({ status: 'delivered' })} />
    </I18nextProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Delivery: Delivered');
  expect(screen.getByText(/Inbox placement is not confirmed/)).toBeVisible();
});
it('labels unproved legacy mail as unavailable instead of trusting historical mailbox status', () => {
  const email = {
    id: 'legacy',
    direction: 'outbound',
    status: 'delivered',
    resend_status: 'delivered',
    from_address: 'sender@example.invalid',
    to_address: 'receiver@example.invalid',
    subject: 'Legacy fixture',
    body_text: 'Synthetic',
    email_date: '2026-10-23T12:00:00Z',
  } as MailboxEmail;
  render(
    <I18nextProvider i18n={i18n}>
      <EmailView email={email} delivery={state({ status: null })} />
    </I18nextProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Delivery status unavailable');
  expect(screen.getByText('No verified receipt is available for this message.')).toBeVisible();
  expect(screen.queryByText('Delivery: Delivered')).toBeNull();
});
it('keeps uncertainty visible and offers only a read-only refresh', () => {
  const props = state({ status: 'uncertain' });
  display(props);
  expect(screen.getByRole('status')).toHaveTextContent('Confirmation pending');
  expect(screen.getByText(/before sending another copy/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
  expect(props.onRefresh).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /send/i })).toBeNull();
});
it('labels a failed refresh as stale and does not invent missing proof after a network error', () => {
  const view = display(state({ error: true }));
  expect(screen.getByRole('status')).toHaveTextContent('Last verified status: Submitted');
  expect(screen.getByText('Could not refresh delivery status.')).toBeVisible();
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <EmailDeliveryStatus {...state({ status: undefined, error: true })} />
    </I18nextProvider>,
  );
  expect(screen.queryByText('No verified receipt is available for this message.')).toBeNull();
});
it('disables refresh during loading and localizes the status and action', async () => {
  const view = display(state({ status: undefined, loading: true, refreshing: true }));
  expect(screen.getByRole('status')).toHaveTextContent('Checking delivery status');
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  await act(async () => { await i18n.changeLanguage('de'); });
  view.rerender(
    <I18nextProvider i18n={i18n}>
      <EmailDeliveryStatus {...state()} />
    </I18nextProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Zustellung: Übermittelt');
  expect(screen.getByRole('button', { name: 'Status aktualisieren' })).toBeEnabled();
});
it('omits outgoing receipt controls on incoming mail and drafts', () => {
  const email = {
    id: 'fixture',
    direction: 'inbound',
    status: 'delivered',
    subject: 'Incoming',
    from_address: 'from@example.invalid',
    to_address: 'to@example.invalid',
    email_date: '2026-10-23T12:00:00Z',
  } as MailboxEmail;
  const view = render(<EmailView email={email} delivery={state({ status: 'delivered' })} />);
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(
    <EmailView email={{ ...email, direction: 'outbound', status: 'draft' }} delivery={state()} />,
  );
  expect(screen.queryByRole('status')).toBeNull();
});
