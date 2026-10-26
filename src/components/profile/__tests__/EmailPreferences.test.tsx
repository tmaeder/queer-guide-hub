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
const delivery = {
  dm_digest_enabled: false,
  group_mentions_enabled: false,
  trip_invites_enabled: false,
  operational_topics: [],
  timezone: 'Etc/UTC',
  quiet_hours_enabled: false,
  quiet_start: 22,
  quiet_end: 8,
  version: 0,
};
describe('account email preferences', () => {
  it('preserves unsaved activity changes when newsletter preferences are saved', async () => {
    api.invoke.mockResolvedValue({
      data: {
        subscription: { status: 'subscribed', topics: ['newsletter'], locale: 'en' },
        delivery_preferences: delivery,
      },
      error: null,
    });
    render(<EmailPreferences />);
    const activity = await screen.findByRole('checkbox', {
      name: 'Email me a daily unread-message digest',
    });
    fireEvent.click(activity);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Product updates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save email preferences' }));
    await waitFor(() =>
      expect(api.invoke.mock.calls.filter((c) => c[1]?.method === 'GET')).toHaveLength(2),
    );
    expect(activity).toBeChecked();
  });

  it('saves explicit activity opt-in and quiet hours without subscribing to marketing', async () => {
    api.invoke.mockImplementation((_name, options) =>
      Promise.resolve({
        data:
          options?.method === 'GET'
            ? { subscription: null, delivery_preferences: delivery }
            : { delivery_preferences: { ...delivery, dm_digest_enabled: true, version: 1 } },
        error: null,
      }),
    );
    render(<EmailPreferences />);
    const optIn = await screen.findByRole('checkbox', {
      name: 'Email me a daily unread-message digest',
    });
    expect(optIn).not.toBeChecked();
    fireEvent.click(optIn);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Hold activity emails during quiet hours' }),
    );
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/Zurich' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save activity email settings' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'delivery_preferences',
          ...delivery,
          dm_digest_enabled: true,
          timezone: 'Europe/Zurich',
          quiet_hours_enabled: true,
        },
      }),
    );
    expect(api.invoke.mock.calls.some((c) => c[1]?.body?.action === 'subscribe')).toBe(false);
  });
  it('saves group mentions independently without enabling message digests', async () => {
    api.invoke.mockImplementation((_name, options) =>
      Promise.resolve({
        data:
          options?.method === 'GET'
            ? { subscription: null, delivery_preferences: delivery }
            : { delivery_preferences: { ...delivery, group_mentions_enabled: true, version: 1 } },
        error: null,
      }),
    );
    render(<EmailPreferences />);
    const mentions = await screen.findByRole('checkbox', {
      name: 'Email me when I am mentioned in a group post',
    });
    expect(mentions).not.toBeChecked();
    fireEvent.click(mentions);
    fireEvent.click(screen.getByRole('button', { name: 'Save activity email settings' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'delivery_preferences',
          ...delivery,
          group_mentions_enabled: true,
        },
      }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Email me a daily unread-message digest' }),
    ).not.toBeChecked();
  });
  it('enables trip invitation email without enabling other activity mail', async () => {
    api.invoke.mockImplementation((_name, options) =>
      Promise.resolve({
        data:
          options?.method === 'GET'
            ? { subscription: null, delivery_preferences: delivery }
            : { delivery_preferences: { ...delivery, trip_invites_enabled: true, version: 1 } },
        error: null,
      }),
    );
    render(<EmailPreferences />);
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Email me when I receive a trip invitation' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save activity email settings' }));
    await waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('email-subscriptions', {
        body: {
          action: 'delivery_preferences',
          ...delivery,
          trip_invites_enabled: true,
        },
      }),
    );
  });
  it('requires a reload after a conflicting save', async () => {
    api.invoke.mockImplementation((_name, options) =>
      Promise.resolve(
        options?.method === 'GET'
          ? {
              data: { subscription: null, delivery_preferences: delivery },
              error: null,
            }
          : { data: null, error: { context: { status: 409 } } },
      ),
    );
    render(<EmailPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save activity email settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed in another session');
    expect(screen.getByRole('button', { name: 'Save activity email settings' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload email settings' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save activity email settings' })).toBeEnabled(),
    );
  });
  it('prevents an empty quiet-hour interval and allows recovery from load failure', async () => {
    api.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    render(<EmailPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Hold activity emails during quiet hours' }),
    );
    fireEvent.change(screen.getByLabelText('Quiet hours end'), { target: { value: '22' } });
    expect(screen.getByRole('button', { name: 'Save activity email settings' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quiet hours end'), { target: { value: '8' } });
    expect(screen.getByRole('button', { name: 'Save activity email settings' })).toBeEnabled();
  });
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

it('keeps group invitations independent of group mentions and newsletter subscriptions', async () => {
  api.invoke.mockImplementation((_name, options) =>
    Promise.resolve({
      data: options?.body
        ? { delivery_preferences: { ...options.body, version: 1 } }
        : { subscription: null, delivery_preferences: delivery },
      error: null,
    }),
  );
  render(<EmailPreferences />);
  const invitation = await screen.findByRole('checkbox', {
    name: 'Email me when I receive a group invitation',
  });
  expect(invitation).not.toBeChecked();
  fireEvent.click(invitation);
  fireEvent.click(screen.getByRole('button', { name: 'Save activity email settings' }));
  await waitFor(() =>
    expect(api.invoke).toHaveBeenCalledWith(
      'email-subscriptions',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'delivery_preferences',
          group_mentions_enabled: false,
          operational_topics: ['group_invitations'],
        }),
      }),
    ),
  );
  expect(api.invoke.mock.calls.filter((c) => c[1]?.body?.action === 'subscribe')).toHaveLength(0);
});

it('saves comment and business topics independently without enabling newsletter or other activity', async () => {
  api.invoke.mockImplementation((_name, options) =>
    Promise.resolve({
      data: options?.body
        ? { delivery_preferences: { ...options.body, version: 1 } }
        : { subscription: null, delivery_preferences: delivery },
      error: null,
    }),
  );
  render(<EmailPreferences />);
  for (const name of [
    'Email me mentions and replies in my groups',
    'Email me mentions and replies in the community',
    'Email me claim and service updates for businesses I represent',
  ]) {
    const toggle = await screen.findByRole('checkbox', { name });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save activity email settings' }));
  await waitFor(() =>
    expect(api.invoke).toHaveBeenCalledWith(
      'email-subscriptions',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'delivery_preferences',
          dm_digest_enabled: false,
          group_mentions_enabled: false,
          trip_invites_enabled: false,
          operational_topics: ['group_comments', 'community_comments', 'business_updates'],
        }),
      }),
    ),
  );
  expect(api.invoke.mock.calls.filter((c) => c[1]?.body?.action === 'subscribe')).toHaveLength(0);
});
